import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import crypto from "crypto";

import { getPool, hasDatabase } from "@/app/lib/db";
import { getSafeErrorMessage } from "@/app/lib/safeError";
import { auditLog } from "@/app/lib/auditLog";
import { getConnection, keypairFromBase58Secret, transferLamportsFromPrivyWallet } from "@/app/lib/solana";
import { confirmSignatureViaRpc } from "@/app/lib/rpc";
import { buildCollectCreatorFeeInstruction, getClaimableCreatorFeeLamports } from "@/app/lib/pumpfun";
import { listCommitments, getEscrowSignerRef } from "@/app/lib/escrowStore";
import { createCampaignEscrowWallet, getCampaignEscrowWallet } from "@/app/lib/campaignEscrow";
import { privySignSolanaTransaction } from "@/app/lib/privy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isCronAuthorized(req: NextRequest): boolean {
  const expected = String(process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const cronSecret = String(req.headers.get("x-cron-secret") ?? "").trim();
  const authHeader = String(req.headers.get("authorization") ?? "").trim();
  return cronSecret === expected || authHeader === `Bearer ${expected}`;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function getCreatorFeeSweepKeepLamports(): number {
  const raw = Number(process.env.CTS_CREATOR_FEE_SWEEP_KEEP_LAMPORTS ?? "");
  if (Number.isFinite(raw) && raw >= 10_000) return Math.floor(raw);
  return 5_000_000;
}

async function getActiveCampaignByTokenMint(tokenMint: string): Promise<any | null> {
  const pool = getPool();
  const res = await pool.query(
    `select *
     from public.campaigns
     where token_mint=$1
       and status='active'
     order by created_at_unix desc
     limit 1`,
    [tokenMint]
  );
  return res.rows?.[0] ?? null;
}

async function findLastSweepMeta(input: { tokenMint: string }): Promise<{
  tsUnix: number;
  claimedLamports: number;
  transferredLamports: number;
} | null> {
  if (!hasDatabase()) return null;
  const pool = getPool();
  const r = await pool.query(
    `select ts_unix,
            (fields->>'claimedLamports')::bigint as claimed_lamports,
            (fields->>'transferredLamports')::bigint as transferred_lamports,
            fields->>'creatorPayoutSig' as creator_payout_sig
     from public.audit_logs
     where event='pumpfun_fee_sweep_ok'
       and fields->>'tokenMint' = $1
     order by ts_unix desc
     limit 1`,
    [input.tokenMint]
  );
  const row = r.rows?.[0] ?? null;
  if (!row) return null;
  const alreadyPaid = String(row.creator_payout_sig ?? "").trim();
  if (alreadyPaid) return null;
  const tsUnix = Number(row.ts_unix ?? 0);
  const claimedLamports = Number(row.claimed_lamports ?? 0);
  const transferredLamports = Number(row.transferred_lamports ?? 0);
  if (!Number.isFinite(tsUnix) || tsUnix <= 0) return null;
  if (!Number.isFinite(claimedLamports) || claimedLamports <= 0) return null;
  if (!Number.isFinite(transferredLamports) || transferredLamports < 0) return null;

  const payoutCheck = await pool.query(
    `select 1
     from public.audit_logs
     where event='pumpfun_creator_payout_ok'
       and fields->>'tokenMint' = $1
       and ts_unix >= $2
     limit 1`,
    [input.tokenMint, String(tsUnix)]
  );
  if (payoutCheck.rowCount && payoutCheck.rowCount > 0) return null;

  return { tsUnix, claimedLamports, transferredLamports };
}

async function sumCreatorPayoutLamports(input: { tokenMint: string }): Promise<number> {
  if (!hasDatabase()) return 0;
  const pool = getPool();
  const res = await pool.query(
    `select sum((fields->>'creatorPayoutLamports')::bigint) as total
     from public.audit_logs
     where event='pumpfun_creator_payout_ok'
       and fields->>'tokenMint' = $1`,
    [input.tokenMint]
  );
  const raw = res.rows?.[0]?.total;
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

async function allocateDepositToRemainingEpochs(input: { campaignId: string; depositLamports: bigint }): Promise<{ updatedEpochs: number }>{
  const pool = getPool();
  const ts = nowUnix();

  const epochsRes = await pool.query(
    `select id, start_at_unix, end_at_unix
     from public.epochs
     where campaign_id=$1
       and status='active'
       and end_at_unix > $2
     order by start_at_unix asc`,
    [input.campaignId, String(ts)]
  );

  const epochs = (epochsRes.rows ?? []) as Array<{ id: string; start_at_unix: any; end_at_unix: any }>;
  if (!epochs.length) return { updatedEpochs: 0 };

  const weights = epochs.map((e) => {
    const start = Number(e.start_at_unix);
    const end = Number(e.end_at_unix);
    const effectiveStart = Math.max(ts, Number.isFinite(start) ? start : ts);
    const remaining = Math.max(0, (Number.isFinite(end) ? end : ts) - effectiveStart);
    return { id: e.id, weightSeconds: remaining };
  });

  let totalWeight = weights.reduce((acc, w) => acc + w.weightSeconds, 0);
  if (totalWeight <= 0) {
    totalWeight = weights.length;
    for (const w of weights) w.weightSeconds = 1;
  }

  let remainingLamports = input.depositLamports;
  let updated = 0;

  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    const isLast = i === weights.length - 1;
    const portion = isLast
      ? remainingLamports
      : (input.depositLamports * BigInt(w.weightSeconds)) / BigInt(totalWeight);

    const add = portion > remainingLamports ? remainingLamports : portion;
    remainingLamports -= add;

    if (add <= 0n) continue;

    await pool.query(
      `update public.epochs
       set reward_pool_lamports = reward_pool_lamports + $2
       where id=$1`,
      [w.id, add.toString()]
    );
    updated += 1;
  }

  return { updatedEpochs: updated };
}

async function recordCampaignDeposit(input: {
  campaignId: string;
  depositorPubkey: string;
  amountLamports: bigint;
  txSig: string;
}): Promise<void> {
  const pool = getPool();
  const ts = nowUnix();
  const existing = await pool.query(`select id from public.campaign_deposits where tx_sig=$1 limit 1`, [input.txSig]);
  if (existing.rows?.[0]?.id) return;

  await pool.query(
    `insert into public.campaign_deposits
     (id, campaign_id, asset_type, mint, amount_lamports, amount_raw, tx_sig, depositor_pubkey, status, deposited_at_unix, created_at_unix)
     values ($1,$2,'sol',null,$3,null,$4,$5,'confirmed',$6,$6)`,
    [crypto.randomUUID(), input.campaignId, input.amountLamports.toString(), input.txSig, input.depositorPubkey, String(ts)]
  );
}

async function runPumpfunFeeSweep(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const params = req.nextUrl.searchParams;
    const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as any) : {};
    const tokenMintFilter = typeof body?.tokenMint === "string" ? body.tokenMint.trim() : String(params.get("tokenMint") ?? "").trim();
    const defaultLimitRaw = Number(process.env.CRON_PUMPFUN_SWEEP_LIMIT ?? "");
    const defaultLimit = Number.isFinite(defaultLimitRaw) && defaultLimitRaw > 0 ? Math.floor(defaultLimitRaw) : 10;
    const limitParam = params.get("limit");
    const hasExplicitLimit = body?.limit != null || limitParam != null;
    const limitRaw = body?.limit != null ? Number(body.limit) : limitParam != null ? Number(limitParam) : defaultLimit;
    const limit = Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : defaultLimit);

    const feePayerSecret = String(process.env.ESCROW_FEE_PAYER_SECRET_KEY ?? "").trim();
    if (!feePayerSecret) {
      return NextResponse.json({ error: "ESCROW_FEE_PAYER_SECRET_KEY is required" }, { status: 500 });
    }

    const feePayer = keypairFromBase58Secret(feePayerSecret);
    const connection = getConnection();
    const confirmTimeoutMsRaw = Number(process.env.CRON_PUMPFUN_CONFIRM_TIMEOUT_MS ?? "");
    const confirmTimeoutMs = Number.isFinite(confirmTimeoutMsRaw) && confirmTimeoutMsRaw > 0 ? confirmTimeoutMsRaw : 8_000;

    const commitments = (await listCommitments()).filter(
      (c) => c.kind === "creator_reward" && c.creatorFeeMode === "managed" && c.status !== "archived" && Boolean(c.tokenMint)
    );

    const targets = tokenMintFilter
      ? commitments.filter((c) => String(c.tokenMint).trim() === tokenMintFilter)
      : hasExplicitLimit
        ? commitments.slice(0, limit)
        : commitments;

    const results: any[] = [];
    const startedAt = Date.now();
    const maxRunMsRaw = Number(process.env.CRON_PUMPFUN_MAX_RUN_MS ?? "");
    const maxRunMs = Number.isFinite(maxRunMsRaw) && maxRunMsRaw > 0 ? maxRunMsRaw : 20_000;
    let timeBudgetReached = false;

    for (const c of targets) {
      if (Date.now() - startedAt > maxRunMs) {
        timeBudgetReached = true;
        break;
      }
      const tokenMint = String(c.tokenMint ?? "").trim();
      const creatorWallet = String(c.authority ?? "").trim();
      const commitmentId = String(c.id ?? "").trim();

      if (!tokenMint || !creatorWallet || !commitmentId) continue;

      try {
        const signerRef = getEscrowSignerRef(c as any);
        if (signerRef.kind !== "privy") {
          results.push({ ok: false, tokenMint, commitmentId, creatorWallet, campaignId: null, error: "Commitment is not Privy-managed" });
          continue;
        }

        const creatorPk = new PublicKey(creatorWallet);
        const claimable = await getClaimableCreatorFeeLamports({ connection, creator: creatorPk });

        const campaign = await getActiveCampaignByTokenMint(tokenMint);
        const campaignId = campaign ? String(campaign.id) : null;
        const projectWallet = campaign ? String(campaign.project_pubkey ?? "").trim() : "";
        const canFundCampaign =
          Boolean(campaign) &&
          Boolean(projectWallet) &&
          Boolean((campaign as any).is_manual_lockup) &&
          String((campaign as any).reward_asset_type ?? "sol") === "sol";

        let escrow: any | null = null;
        if (canFundCampaign) {
          escrow = await getCampaignEscrowWallet(String((campaign as any).id));
          if (!escrow) {
            escrow = await createCampaignEscrowWallet(String((campaign as any).id));
          }
        }

        if (claimable.claimableLamports <= 0) {
          const keepLamports = getCreatorFeeSweepKeepLamports();

          // Recovery path A: if we previously claimed+funded escrow but didn't pay the creator share, pay it now.
          const meta = await findLastSweepMeta({ tokenMint });
          if (meta) {
            const intendedCreatorLamports = Math.max(0, meta.claimedLamports - meta.transferredLamports - keepLamports);
            if (intendedCreatorLamports > 0 && projectWallet) {
              const toPk = new PublicKey(projectWallet);
              const payout = await transferLamportsFromPrivyWallet({
                connection,
                walletId: signerRef.walletId,
                fromPubkey: creatorPk,
                to: toPk,
                lamports: intendedCreatorLamports,
                confirmTimeoutMs,
              });

              await auditLog("pumpfun_creator_payout_ok", {
                tokenMint,
                commitmentId,
                creatorWallet,
                campaignId,
                projectWallet,
                creatorPayoutSig: payout.signature,
                creatorPayoutLamports: intendedCreatorLamports,
                source: "recovery",
              });

              results.push({
                ok: true,
                tokenMint,
                commitmentId,
                creatorWallet,
                campaignId,
                skipped: true,
                claimableLamports: 0,
                creatorPayoutSig: payout.signature,
                creatorPayoutLamports: intendedCreatorLamports,
              });
              continue;
            }

            results.push({
              ok: true,
              tokenMint,
              commitmentId,
              creatorWallet,
              campaignId,
              skipped: true,
              claimableLamports: 0,
              note: intendedCreatorLamports > 0 && !projectWallet ? "No project wallet available for payout" : undefined,
            });
            continue;
          }

          // Recovery path B: sweep any SOL sitting in treasury wallet to campaign escrow.
          // This handles cases where fees were claimed but not yet transferred to escrow.
          if (!canFundCampaign || !escrow) {
            const treasuryBal = Number(await connection.getBalance(creatorPk, "confirmed").catch(() => 0)) || 0;
            const availableTreasuryLamports = Math.max(0, treasuryBal - keepLamports);
            results.push({
              ok: true,
              tokenMint,
              commitmentId,
              creatorWallet,
              campaignId,
              skipped: true,
              claimableLamports: 0,
              treasuryBal,
              availableTreasuryLamports,
              note: "Treasury recovery skipped (no active manual lockup SOL campaign)",
            });
            continue;
          }

          const treasuryBal = Number(await connection.getBalance(creatorPk, "confirmed").catch(() => 0)) || 0;
          const availableTreasuryLamports = Math.max(0, treasuryBal - keepLamports);
          
          // Minimum threshold to trigger a sweep (avoid dust sweeps)
          const minSweepLamports = 10_000_000; // 0.01 SOL
          
          if (availableTreasuryLamports >= minSweepLamports) {
            // Split 50/50 between escrow (holder rewards) and project wallet (creator share)
            const holderShareLamports = Math.floor(availableTreasuryLamports / 2);
            const creatorShareLamports = availableTreasuryLamports - holderShareLamports;
            
            let transferSig: string | null = null;
            let creatorPayoutSig: string | null = null;
            
            // Transfer holder share to escrow
            if (holderShareLamports > 0) {
              const escrowPk = new PublicKey(String(escrow.walletPubkey));
              const transferRes = await transferLamportsFromPrivyWallet({
                connection,
                walletId: signerRef.walletId,
                fromPubkey: creatorPk,
                to: escrowPk,
                lamports: holderShareLamports,
                confirmTimeoutMs,
              });
              transferSig = transferRes.signature;
              
              await recordCampaignDeposit({
                campaignId: String((campaign as any).id),
                depositorPubkey: creatorWallet,
                amountLamports: BigInt(holderShareLamports),
                txSig: transferRes.signature,
              });
              
              const pool = getPool();
              const ts = nowUnix();
              await pool.query(
                `update public.campaigns
                 set reward_pool_lamports = reward_pool_lamports + $2,
                     updated_at_unix = $3
                 where id=$1`,
                [String((campaign as any).id), String(holderShareLamports), String(ts)]
              );
              
              await allocateDepositToRemainingEpochs({ campaignId: String((campaign as any).id), depositLamports: BigInt(holderShareLamports) });
            }
            
            // Transfer creator share to project wallet
            if (creatorShareLamports > 0) {
              const toPk = new PublicKey(projectWallet);
              const payout = await transferLamportsFromPrivyWallet({
                connection,
                walletId: signerRef.walletId,
                fromPubkey: creatorPk,
                to: toPk,
                lamports: creatorShareLamports,
                confirmTimeoutMs,
              });
              creatorPayoutSig = payout.signature;
              
              await auditLog("pumpfun_creator_payout_ok", {
                tokenMint,
                commitmentId,
                creatorWallet,
                campaignId: String((campaign as any).id),
                projectWallet,
                creatorPayoutSig: payout.signature,
                creatorPayoutLamports: creatorShareLamports,
                source: "treasury_sweep",
              });
            }
            
            await auditLog("pumpfun_fee_sweep_ok", {
              tokenMint,
              commitmentId,
              creatorWallet,
              campaignId: String((campaign as any).id),
              source: "treasury_recovery",
              treasuryBal,
              availableTreasuryLamports,
              holderShareLamports,
              creatorShareLamports,
              transferSig,
              creatorPayoutSig,
            });
            
            results.push({
              ok: true,
              tokenMint,
              commitmentId,
              creatorWallet,
              campaignId: (campaign as any).id,
              source: "treasury_recovery",
              claimableLamports: 0,
              treasuryBal,
              availableTreasuryLamports,
              holderShareLamports,
              creatorShareLamports,
              transferSig,
              creatorPayoutSig,
            });
            continue;
          }
          
          results.push({ ok: true, tokenMint, commitmentId, creatorWallet, campaignId, skipped: true, claimableLamports: 0, treasuryBal, availableTreasuryLamports, note: "Below sweep threshold" });
          continue;
        }

        const { ix: claimIx } = buildCollectCreatorFeeInstruction({ creator: creatorPk });
        const latest = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction();
        tx.feePayer = feePayer.publicKey;
        tx.recentBlockhash = latest.blockhash;
        tx.lastValidBlockHeight = latest.lastValidBlockHeight;
        tx.add(claimIx);
        tx.partialSign(feePayer);

        const txBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
        const signed = await privySignSolanaTransaction({ walletId: signerRef.walletId, transactionBase64: txBase64 });

        const raw = Buffer.from(String(signed.signedTransactionBase64), "base64");
        const claimSig = await connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "processed", maxRetries: 2 });
        await confirmSignatureViaRpc(connection, claimSig, "confirmed", { timeoutMs: confirmTimeoutMs });

        if (!canFundCampaign || !escrow) {
          await auditLog("pumpfun_fee_claim_ok", {
            tokenMint,
            commitmentId,
            creatorWallet,
            campaignId,
            creatorVault: claimable.creatorVault.toBase58(),
            claimedLamports: claimable.claimableLamports,
            claimSig,
            note: "Claimed fees to treasury wallet; campaign funding skipped",
          });

          results.push({
            ok: true,
            tokenMint,
            commitmentId,
            creatorWallet,
            campaignId,
            creatorVault: claimable.creatorVault.toBase58(),
            claimedLamports: claimable.claimableLamports,
            claimSig,
            skippedFunding: true,
          });
          continue;
        }

        const keepLamports = getCreatorFeeSweepKeepLamports();
        const holderShareLamports = Math.floor(claimable.claimableLamports / 2);
        const creatorShareLamports = Math.max(0, claimable.claimableLamports - holderShareLamports - keepLamports);
        const totalFeeLamportsInc = Math.max(0, holderShareLamports + creatorShareLamports);
        if (holderShareLamports <= 0) {
          results.push({
            ok: true,
            tokenMint,
            commitmentId,
            creatorWallet,
            campaignId,
            claimSig,
            claimedLamports: claimable.claimableLamports,
            transferredLamports: 0,
            note: "Claimed fees but holder share rounded to 0",
          });
          continue;
        }

        const escrowPk = new PublicKey(String(escrow.walletPubkey));
        const transferRes = await transferLamportsFromPrivyWallet({
          connection,
          walletId: signerRef.walletId,
          fromPubkey: creatorPk,
          to: escrowPk,
          lamports: holderShareLamports,
          confirmTimeoutMs,
        });

        let creatorPayoutSig: string | null = null;
        if (creatorShareLamports > 0) {
          const toPk = new PublicKey(projectWallet);
          const payout = await transferLamportsFromPrivyWallet({
            connection,
            walletId: signerRef.walletId,
            fromPubkey: creatorPk,
            to: toPk,
            lamports: creatorShareLamports,
            confirmTimeoutMs,
          });
          creatorPayoutSig = payout.signature;
          await auditLog("pumpfun_creator_payout_ok", {
            tokenMint,
            commitmentId,
            creatorWallet,
            campaignId: String((campaign as any).id),
            projectWallet,
            creatorPayoutSig,
            creatorPayoutLamports: creatorShareLamports,
            source: "same_sweep",
          });
        }

        await recordCampaignDeposit({
          campaignId: String((campaign as any).id),
          depositorPubkey: creatorWallet,
          amountLamports: BigInt(holderShareLamports),
          txSig: transferRes.signature,
        });

        const pool = getPool();
        const ts = nowUnix();
        await pool.query(
          `update public.campaigns
           set reward_pool_lamports = reward_pool_lamports + $2,
               platform_fee_lamports = platform_fee_lamports + $3,
               total_fee_lamports = total_fee_lamports + $4,
               updated_at_unix = $5
           where id=$1`,
          [String((campaign as any).id), String(holderShareLamports), String(creatorShareLamports), String(totalFeeLamportsInc), String(ts)]
        );

        const epochAlloc = await allocateDepositToRemainingEpochs({ campaignId: String((campaign as any).id), depositLamports: BigInt(holderShareLamports) });

        await auditLog("pumpfun_fee_sweep_ok", {
          tokenMint,
          commitmentId,
          creatorWallet,
          campaignId: String((campaign as any).id),
          creatorVault: claimable.creatorVault.toBase58(),
          claimedLamports: claimable.claimableLamports,
          claimSig,
          escrowWallet: escrow.walletPubkey,
          transferSig: transferRes.signature,
          transferredLamports: holderShareLamports,
          creatorPayoutSig,
          creatorPayoutLamports: creatorShareLamports,
          updatedEpochs: epochAlloc.updatedEpochs,
        });

        results.push({
          ok: true,
          tokenMint,
          commitmentId,
          creatorWallet,
          campaignId: (campaign as any).id,
          creatorVault: claimable.creatorVault.toBase58(),
          claimedLamports: claimable.claimableLamports,
          claimSig,
          escrowWallet: escrow.walletPubkey,
          transferSig: transferRes.signature,
          transferredLamports: holderShareLamports,
          creatorPayoutSig,
          creatorPayoutLamports: creatorShareLamports,
          updatedEpochs: epochAlloc.updatedEpochs,
        });
      } catch (e) {
        const msg = getSafeErrorMessage(e);
        await auditLog("pumpfun_fee_sweep_error", { tokenMint, commitmentId, creatorWallet, error: msg });
        results.push({ ok: false, tokenMint, commitmentId, creatorWallet, error: msg });
      }
    }

    const processed = results.length;
    const remaining = timeBudgetReached ? Math.max(0, targets.length - processed) : 0;
    return NextResponse.json({ ok: true, swept: processed, processed, targeted: targets.length, remaining, timeBudgetReached, results });
  } catch (e) {
    const msg = getSafeErrorMessage(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runPumpfunFeeSweep(req);
}

export async function GET(req: NextRequest) {
  return runPumpfunFeeSweep(req);
}

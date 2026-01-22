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

export async function POST(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const tokenMintFilter = typeof body?.tokenMint === "string" ? body.tokenMint.trim() : "";
    const limitRaw = body?.limit != null ? Number(body.limit) : 50;
    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50));

    const feePayerSecret = String(process.env.ESCROW_FEE_PAYER_SECRET_KEY ?? "").trim();
    if (!feePayerSecret) {
      return NextResponse.json({ error: "ESCROW_FEE_PAYER_SECRET_KEY is required" }, { status: 500 });
    }

    const feePayer = keypairFromBase58Secret(feePayerSecret);
    const connection = getConnection();

    const commitments = (await listCommitments()).filter(
      (c) => c.kind === "creator_reward" && c.creatorFeeMode === "managed" && c.status !== "archived" && Boolean(c.tokenMint)
    );

    const targets = tokenMintFilter
      ? commitments.filter((c) => String(c.tokenMint).trim() === tokenMintFilter)
      : commitments.slice(0, limit);

    const results: any[] = [];

    for (const c of targets) {
      const tokenMint = String(c.tokenMint ?? "").trim();
      const creatorWallet = String(c.authority ?? "").trim();
      const commitmentId = String(c.id ?? "").trim();

      if (!tokenMint || !creatorWallet || !commitmentId) continue;

      try {
        const campaign = await getActiveCampaignByTokenMint(tokenMint);
        if (!campaign) {
          results.push({ ok: false, tokenMint, commitmentId, creatorWallet, error: "No active campaign found for token" });
          continue;
        }

        if (!Boolean(campaign.is_manual_lockup)) {
          results.push({
            ok: false,
            tokenMint,
            commitmentId,
            creatorWallet,
            campaignId: campaign.id,
            error: "Campaign is not manual lockup. Manual lockup is required for fee-funded SOL rewards.",
          });
          continue;
        }

        if (String(campaign.reward_asset_type ?? "sol") !== "sol") {
          results.push({
            ok: false,
            tokenMint,
            commitmentId,
            creatorWallet,
            campaignId: campaign.id,
            error: "Campaign reward asset type must be SOL for Pump.fun fee funding.",
          });
          continue;
        }

        let escrow = await getCampaignEscrowWallet(String(campaign.id));
        if (!escrow) {
          escrow = await createCampaignEscrowWallet(String(campaign.id));
        }

        const signerRef = getEscrowSignerRef(c as any);
        if (signerRef.kind !== "privy") {
          results.push({ ok: false, tokenMint, commitmentId, creatorWallet, campaignId: campaign.id, error: "Commitment is not Privy-managed" });
          continue;
        }

        const creatorPk = new PublicKey(creatorWallet);
        const claimable = await getClaimableCreatorFeeLamports({ connection, creator: creatorPk });
        if (claimable.claimableLamports <= 0) {
          results.push({ ok: true, tokenMint, commitmentId, creatorWallet, campaignId: campaign.id, skipped: true, claimableLamports: 0 });
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
        await confirmSignatureViaRpc(connection, claimSig, "confirmed", { timeoutMs: 60_000 });

        const holderShareLamports = Math.floor(claimable.claimableLamports / 2);
        if (holderShareLamports <= 0) {
          results.push({
            ok: true,
            tokenMint,
            commitmentId,
            creatorWallet,
            campaignId: campaign.id,
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
        });

        await recordCampaignDeposit({
          campaignId: String(campaign.id),
          depositorPubkey: creatorWallet,
          amountLamports: BigInt(holderShareLamports),
          txSig: transferRes.signature,
        });

        const pool = getPool();
        const ts = nowUnix();
        await pool.query(
          `update public.campaigns
           set reward_pool_lamports = reward_pool_lamports + $2,
               total_fee_lamports = total_fee_lamports + $3,
               updated_at_unix = $4
           where id=$1`,
          [String(campaign.id), String(holderShareLamports), String(holderShareLamports), String(ts)]
        );

        const epochAlloc = await allocateDepositToRemainingEpochs({ campaignId: String(campaign.id), depositLamports: BigInt(holderShareLamports) });

        await auditLog("pumpfun_fee_sweep_ok", {
          tokenMint,
          commitmentId,
          creatorWallet,
          campaignId: String(campaign.id),
          creatorVault: claimable.creatorVault.toBase58(),
          claimedLamports: claimable.claimableLamports,
          claimSig,
          escrowWallet: escrow.walletPubkey,
          transferSig: transferRes.signature,
          transferredLamports: holderShareLamports,
          updatedEpochs: epochAlloc.updatedEpochs,
        });

        results.push({
          ok: true,
          tokenMint,
          commitmentId,
          creatorWallet,
          campaignId: campaign.id,
          creatorVault: claimable.creatorVault.toBase58(),
          claimedLamports: claimable.claimableLamports,
          claimSig,
          escrowWallet: escrow.walletPubkey,
          transferSig: transferRes.signature,
          transferredLamports: holderShareLamports,
          updatedEpochs: epochAlloc.updatedEpochs,
        });
      } catch (e) {
        const msg = getSafeErrorMessage(e);
        await auditLog("pumpfun_fee_sweep_error", { tokenMint, commitmentId, creatorWallet, error: msg });
        results.push({ ok: false, tokenMint, commitmentId, creatorWallet, error: msg });
      }
    }

    return NextResponse.json({ ok: true, swept: results.length, results });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

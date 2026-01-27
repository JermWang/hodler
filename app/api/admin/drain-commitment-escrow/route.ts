import { NextResponse } from "next/server";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { auditLog } from "../../../lib/auditLog";
import { getSafeErrorMessage, redactSensitive } from "../../../lib/safeError";
import { getPool, hasDatabase } from "../../../lib/db";
import { getActiveCommitmentByTokenMint, getEscrowSignerRef } from "../../../lib/escrowStore";
import { privySignSolanaTransaction } from "../../../lib/privy";
import { confirmTransactionSignature, getBalanceLamports, getConnection, keypairFromBase58Secret } from "../../../lib/solana";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    verifyAdminOrigin(req);
    const adminOk = await isAdminRequestAsync(req);
    if (!adminOk) {
      await auditLog("admin_drain_commitment_escrow_denied", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const tokenMint = typeof body?.tokenMint === "string" ? body.tokenMint.trim() : "";
    const authorityWallet = typeof body?.authorityWallet === "string" ? body.authorityWallet.trim() : "";
    const destinationWallet = typeof body?.destinationWallet === "string" ? body.destinationWallet.trim() : "";

    if (!tokenMint && !authorityWallet) {
      return NextResponse.json({ error: "tokenMint or authorityWallet is required" }, { status: 400 });
    }
    if (!destinationWallet) {
      return NextResponse.json({ error: "destinationWallet is required" }, { status: 400 });
    }

    let destPk: PublicKey;
    try {
      destPk = new PublicKey(destinationWallet);
    } catch {
      return NextResponse.json({ error: "Invalid destinationWallet" }, { status: 400 });
    }

    let commitment = tokenMint ? await getActiveCommitmentByTokenMint(tokenMint) : null;
    if (!commitment && authorityWallet) {
      const pool = getPool();
      const res = await pool.query(
        "select * from commitments where authority=$1 and status in ('active','created') order by created_at_unix desc limit 1",
        [authorityWallet]
      );
      const row = res.rows?.[0] ?? null;
      if (row) {
        // Inline row mapping to avoid exporting new helpers
        commitment = {
          id: String(row.id),
          statement: row.statement ?? undefined,
          authority: String(row.authority),
          destinationOnFail: String(row.destination_on_fail),
          amountLamports: Number(row.amount_lamports),
          deadlineUnix: Number(row.deadline_unix),
          escrowPubkey: String(row.escrow_pubkey),
          escrowSecretKey: String(row.escrow_secret_key),
          kind: String(row.kind),
          creatorPubkey: row.creator_pubkey ?? undefined,
          creatorFeeMode: row.creator_fee_mode ?? undefined,
          tokenMint: row.token_mint ?? undefined,
          bagsDevTwitter: row.bags_dev_twitter ?? undefined,
          bagsCreatorTwitter: row.bags_creator_twitter ?? undefined,
          bagsDevWallet: row.bags_dev_wallet ?? undefined,
          bagsCreatorWallet: row.bags_creator_wallet ?? undefined,
          bagsDevBps: row.bags_dev_bps == null ? undefined : Number(row.bags_dev_bps),
          bagsCreatorBps: row.bags_creator_bps == null ? undefined : Number(row.bags_creator_bps),
          totalFundedLamports: Number(row.total_funded_lamports ?? 0),
          unlockedLamports: Number(row.unlocked_lamports ?? 0),
          milestones: row.milestones_json ? (JSON.parse(String(row.milestones_json)) as any) : undefined,
          status: String(row.status),
          createdAtUnix: Number(row.created_at_unix),
          resolvedAtUnix: row.resolved_at_unix == null ? undefined : Number(row.resolved_at_unix),
          resolvedTxSig: row.resolved_tx_sig ?? undefined,
          devBuyTokenAmount: row.dev_buy_token_amount ?? undefined,
          devBuyTokensClaimed: row.dev_buy_tokens_claimed ?? undefined,
          devBuyClaimTxSigs: row.dev_buy_claim_tx_sigs ? (JSON.parse(String(row.dev_buy_claim_tx_sigs)) as any) : undefined,
        } as any;
      }
    }
    if (!commitment) {
      return NextResponse.json({ error: "No active commitment found for tokenMint" }, { status: 404 });
    }

    const escrowPubkeyStr = String(commitment.escrowPubkey ?? "").trim();
    if (!escrowPubkeyStr) {
      return NextResponse.json({ error: "Commitment has no escrowPubkey" }, { status: 500 });
    }

    const connection = getConnection();
    const escrowPk = new PublicKey(escrowPubkeyStr);

    const balanceLamports = await getBalanceLamports(connection, escrowPk);

    const feePayerSecret = String(process.env.ESCROW_FEE_PAYER_SECRET_KEY ?? "").trim();
    if (!feePayerSecret) {
      return NextResponse.json({ error: "ESCROW_FEE_PAYER_SECRET_KEY is required" }, { status: 500 });
    }
    const feePayer = keypairFromBase58Secret(feePayerSecret);

    const keepLamports = 5_000;
    const transferLamports = Math.max(0, balanceLamports - keepLamports);

    if (transferLamports <= 0) {
      return NextResponse.json(
        {
          error: "Commitment escrow has no claimable balance",
          commitmentId: commitment.id,
          escrowPubkey: escrowPubkeyStr,
          balanceLamports,
        },
        { status: 400 }
      );
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    tx.feePayer = feePayer.publicKey;
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.add(
      SystemProgram.transfer({
        fromPubkey: escrowPk,
        toPubkey: destPk,
        lamports: transferLamports,
      })
    );

    tx.partialSign(feePayer);

    const signerRef = getEscrowSignerRef(commitment);
    if (signerRef.kind === "privy") {
      const txBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
      const signed = await privySignSolanaTransaction({ walletId: signerRef.walletId, transactionBase64: txBase64 });
      const raw = Buffer.from(String(signed.signedTransactionBase64), "base64");
      const signature = await connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "processed", maxRetries: 2 });
      await confirmTransactionSignature({ connection, signature, blockhash, lastValidBlockHeight });

      await auditLog("admin_drain_commitment_escrow_ok", {
        tokenMint: tokenMint || String((commitment as any)?.tokenMint ?? ""),
        commitmentId: commitment.id,
        escrowPubkey: escrowPubkeyStr,
        destinationWallet,
        transferLamports,
        signature,
      });

      return NextResponse.json({
        ok: true,
        tokenMint: tokenMint || String((commitment as any)?.tokenMint ?? ""),
        commitmentId: commitment.id,
        escrowPubkey: escrowPubkeyStr,
        destinationWallet,
        transferLamports,
        transferSol: transferLamports / 1e9,
        signature,
        message: `Drained ${(transferLamports / 1e9).toFixed(6)} SOL from commitment escrow`,
      });
    }

    const escrowKeypair = keypairFromBase58Secret(signerRef.escrowSecretKeyB58);
    tx.partialSign(escrowKeypair);

    const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: "processed", maxRetries: 2 });
    await confirmTransactionSignature({ connection, signature, blockhash, lastValidBlockHeight });

    await auditLog("admin_drain_commitment_escrow_ok", {
      tokenMint: tokenMint || String((commitment as any)?.tokenMint ?? ""),
      commitmentId: commitment.id,
      escrowPubkey: escrowPubkeyStr,
      destinationWallet,
      transferLamports,
      signature,
    });

    return NextResponse.json({
      ok: true,
      tokenMint: tokenMint || String((commitment as any)?.tokenMint ?? ""),
      commitmentId: commitment.id,
      escrowPubkey: escrowPubkeyStr,
      destinationWallet,
      transferLamports,
      transferSol: transferLamports / 1e9,
      signature,
      message: `Drained ${(transferLamports / 1e9).toFixed(6)} SOL from commitment escrow`,
    });
  } catch (e) {
    const safe = getSafeErrorMessage(e);
    const rawError = redactSensitive(String((e as any)?.message ?? e ?? ""));
    await auditLog("admin_drain_commitment_escrow_error", { error: safe, rawError });
    return NextResponse.json({ error: safe, rawError }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    verifyAdminOrigin(req);
    const adminOk = await isAdminRequestAsync(req);
    if (!adminOk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const url = new URL(req.url);
    const tokenMint = String(url.searchParams.get("tokenMint") ?? "").trim();
    const authorityWallet = String(url.searchParams.get("authorityWallet") ?? "").trim();
    if (!tokenMint && !authorityWallet) {
      return NextResponse.json({ error: "tokenMint or authorityWallet is required" }, { status: 400 });
    }

    let commitment = tokenMint ? await getActiveCommitmentByTokenMint(tokenMint) : null;
    if (!commitment && authorityWallet) {
      const pool = getPool();
      const res = await pool.query(
        "select * from commitments where authority=$1 and status in ('active','created') order by created_at_unix desc limit 1",
        [authorityWallet]
      );
      const row = res.rows?.[0] ?? null;
      if (row) {
        commitment = {
          id: String(row.id),
          statement: row.statement ?? undefined,
          authority: String(row.authority),
          destinationOnFail: String(row.destination_on_fail),
          amountLamports: Number(row.amount_lamports),
          deadlineUnix: Number(row.deadline_unix),
          escrowPubkey: String(row.escrow_pubkey),
          escrowSecretKey: String(row.escrow_secret_key),
          kind: String(row.kind),
          creatorPubkey: row.creator_pubkey ?? undefined,
          creatorFeeMode: row.creator_fee_mode ?? undefined,
          tokenMint: row.token_mint ?? undefined,
          bagsDevTwitter: row.bags_dev_twitter ?? undefined,
          bagsCreatorTwitter: row.bags_creator_twitter ?? undefined,
          bagsDevWallet: row.bags_dev_wallet ?? undefined,
          bagsCreatorWallet: row.bags_creator_wallet ?? undefined,
          bagsDevBps: row.bags_dev_bps == null ? undefined : Number(row.bags_dev_bps),
          bagsCreatorBps: row.bags_creator_bps == null ? undefined : Number(row.bags_creator_bps),
          totalFundedLamports: Number(row.total_funded_lamports ?? 0),
          unlockedLamports: Number(row.unlocked_lamports ?? 0),
          milestones: row.milestones_json ? (JSON.parse(String(row.milestones_json)) as any) : undefined,
          status: String(row.status),
          createdAtUnix: Number(row.created_at_unix),
          resolvedAtUnix: row.resolved_at_unix == null ? undefined : Number(row.resolved_at_unix),
          resolvedTxSig: row.resolved_tx_sig ?? undefined,
          devBuyTokenAmount: row.dev_buy_token_amount ?? undefined,
          devBuyTokensClaimed: row.dev_buy_tokens_claimed ?? undefined,
          devBuyClaimTxSigs: row.dev_buy_claim_tx_sigs ? (JSON.parse(String(row.dev_buy_claim_tx_sigs)) as any) : undefined,
        } as any;
      }
    }
    if (!commitment) {
      return NextResponse.json({ error: "No active commitment found for tokenMint" }, { status: 404 });
    }

    const escrowPubkeyStr = String(commitment.escrowPubkey ?? "").trim();
    const connection = getConnection();
    let escrowBalanceLamports = 0;
    if (escrowPubkeyStr) {
      try {
        escrowBalanceLamports = await getBalanceLamports(connection, new PublicKey(escrowPubkeyStr));
      } catch {
        escrowBalanceLamports = 0;
      }
    }

    const pool = getPool();
    const campaignRes = await pool.query(
      `select id, name, status from public.campaigns where token_mint=$1 order by created_at_unix desc limit 1`,
      [tokenMint]
    );
    const campaign = campaignRes.rows?.[0] ?? null;

    return NextResponse.json({
      ok: true,
      tokenMint: tokenMint || String((commitment as any)?.tokenMint ?? ""),
      commitmentId: commitment.id,
      commitmentEscrowPubkey: escrowPubkeyStr,
      commitmentEscrowBalanceLamports: escrowBalanceLamports,
      commitmentEscrowBalanceSol: escrowBalanceLamports / 1e9,
      campaign: campaign
        ? {
            id: String(campaign.id),
            name: String(campaign.name ?? ""),
            status: String(campaign.status ?? ""),
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

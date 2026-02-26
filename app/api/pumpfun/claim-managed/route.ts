import { NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

import { getChainUnixTime, getSolanaCaip2, keypairFromBase58Secret } from "../../../lib/solana";
import { withRpcFallback } from "../../../lib/rpc";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage, redactSensitive } from "../../../lib/safeError";
import { getLaunchTreasuryWallet } from "../../../lib/launchTreasuryStore";
import { buildCollectCreatorFeeInstruction, getClaimableCreatorFeeLamports } from "../../../lib/pumpfun";
import { privySignAndSendSolanaTransaction, privySignSolanaTransaction } from "../../../lib/privy";

export const runtime = "nodejs";

function expectedClaimMessage(input: { payerWallet: string; timestampUnix: number }): string {
  return `HODLR\nPump.fun Claim Managed\nPayer: ${input.payerWallet}\nTimestamp: ${input.timestampUnix}`;
}

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "pumpfun:claim-managed", limit: 20, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const body = (await req.json().catch(() => null)) as any;
    const payerWalletRaw = typeof body?.payerWallet === "string" ? body.payerWallet.trim() : "";
    const timestampUnix = Number(body?.timestampUnix);
    const signatureB58 = typeof body?.signatureB58 === "string" ? body.signatureB58.trim() : "";

    if (!payerWalletRaw) return NextResponse.json({ error: "payerWallet is required" }, { status: 400 });
    if (!Number.isFinite(timestampUnix) || timestampUnix <= 0) {
      return NextResponse.json({ error: "timestampUnix is required" }, { status: 400 });
    }
    if (!signatureB58) return NextResponse.json({ error: "signatureB58 is required" }, { status: 400 });

    let payer: PublicKey;
    try {
      payer = new PublicKey(payerWalletRaw);
    } catch {
      return NextResponse.json({ error: "Invalid payerWallet" }, { status: 400 });
    }

    const payerWallet = payer.toBase58();

    const response = await withRpcFallback(async (connection) => {
      const nowUnix = await getChainUnixTime(connection);

      const skew = Math.abs(nowUnix - Math.floor(timestampUnix));
      if (skew > 10 * 60) {
        return NextResponse.json({ error: "timestampUnix is too far from current time" }, { status: 400 });
      }

      const msg = expectedClaimMessage({ payerWallet, timestampUnix: Math.floor(timestampUnix) });
      const signature = bs58.decode(signatureB58);
      const ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), signature, payer.toBytes());
      if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

      const treasury = await getLaunchTreasuryWallet(payerWallet);
      if (!treasury?.treasuryWallet || !treasury?.walletId) {
        return NextResponse.json({ error: "Launch treasury wallet not found" }, { status: 404 });
      }

      const creatorPubkey = new PublicKey(treasury.treasuryWallet);

      const claimable = await getClaimableCreatorFeeLamports({ connection, creator: creatorPubkey });
      if (claimable.claimableLamports <= 0) {
        return NextResponse.json(
          {
            error: "No claimable creator fees",
            nowUnix,
            payerWallet,
            creator: creatorPubkey.toBase58(),
            treasuryWallet: creatorPubkey.toBase58(),
            creatorVault: claimable.creatorVault.toBase58(),
            claimableLamports: claimable.claimableLamports,
            rentExemptMinLamports: claimable.rentExemptMinLamports,
            vaultBalanceLamports: claimable.vaultBalanceLamports,
          },
          { status: 409 }
        );
      }

      const feePayerSecret = String(process.env.ESCROW_FEE_PAYER_SECRET_KEY ?? "").trim();
      if (!feePayerSecret) {
        return NextResponse.json({ error: "ESCROW_FEE_PAYER_SECRET_KEY is required" }, { status: 500 });
      }

      const feePayer = keypairFromBase58Secret(feePayerSecret);
      const { ix: claimIx } = buildCollectCreatorFeeInstruction({ creator: creatorPubkey });

      const latest = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.feePayer = feePayer.publicKey;
      tx.recentBlockhash = latest.blockhash;
      tx.lastValidBlockHeight = latest.lastValidBlockHeight;
      tx.add(claimIx);
      tx.partialSign(feePayer);

      const txBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
      const signed = await privySignSolanaTransaction({ walletId: treasury.walletId, transactionBase64: txBase64 });

      const sent = await privySignAndSendSolanaTransaction({
        walletId: treasury.walletId,
        caip2: getSolanaCaip2(),
        transactionBase64: signed.signedTransactionBase64,
      });

      return NextResponse.json({
        ok: true,
        nowUnix,
        payerWallet,
        creator: creatorPubkey.toBase58(),
        treasuryWallet: creatorPubkey.toBase58(),
        creatorVault: claimable.creatorVault.toBase58(),
        claimableLamports: claimable.claimableLamports,
        signature: sent.signature,
        solscanUrl: `https://solscan.io/tx/${encodeURIComponent(sent.signature)}`,
        message: msg,
      });
    });

    return response;
  } catch (e) {
    const error = getSafeErrorMessage(e);
    const rawError = redactSensitive(String((e as any)?.rawError ?? (e as any)?.message ?? e ?? ""));
    const logs = Array.isArray((e as any)?.logs) ? ((e as any).logs as any[]).map((l) => String(l)) : undefined;
    return NextResponse.json({ error, rawError: rawError || null, logs: logs?.length ? logs : null }, { status: 500 });
  }
}

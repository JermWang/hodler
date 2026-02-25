import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

import { getPool, hasDatabase } from "@/app/lib/db";
import { getSafeErrorMessage } from "@/app/lib/safeError";
import { auditLog } from "@/app/lib/auditLog";
import { getConnection, keypairFromBase58Secret } from "@/app/lib/solana";
import { confirmSignatureViaRpc } from "@/app/lib/rpc";
import { 
  getClaimableAmmCreatorFeeLamports,
  buildCollectAmmCreatorFeeInstruction,
} from "@/app/lib/pumpfun";
import { listCommitments, getEscrowSignerRef } from "@/app/lib/escrowStore";
import { privySignSolanaTransaction } from "@/app/lib/privy";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

function verifySignature(message: string, signatureB58: string, publicKeyB58: string): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signatureB58);
    const publicKeyBytes = bs58.decode(publicKeyB58);
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const payerWallet = String(body?.payerWallet ?? "").trim();
    const timestampUnix = Number(body?.timestampUnix ?? 0);
    const signatureB58 = String(body?.signatureB58 ?? "").trim();

    if (!payerWallet || !timestampUnix || !signatureB58) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify signature
    const expectedMsg = `AmpliFi\nClaim WSOL Fees\nPayer: ${payerWallet}\nTimestamp: ${timestampUnix}`;
    if (!verifySignature(expectedMsg, signatureB58, payerWallet)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Check timestamp is recent (within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampUnix) > 300) {
      return NextResponse.json({ error: "Signature expired" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const feePayerSecret = String(process.env.ESCROW_FEE_PAYER_SECRET_KEY ?? "").trim();
    if (!feePayerSecret) {
      return NextResponse.json({ error: "Fee payer not configured" }, { status: 500 });
    }

    const feePayer = keypairFromBase58Secret(feePayerSecret);
    const connection = getConnection();

    // Find the commitment for this payer wallet (including archived)
    const commitments = (await listCommitments()).filter(
      (c) => c.kind === "creator_reward" && c.creatorFeeMode === "managed" && Boolean(c.tokenMint)
    );

    const commitment = commitments.find((c) => String(c.authority ?? "").trim() === payerWallet);
    if (!commitment) {
      return NextResponse.json({ error: "No managed commitment found for this wallet" }, { status: 404 });
    }

    const signerRef = getEscrowSignerRef(commitment as any);
    if (signerRef.kind !== "privy") {
      return NextResponse.json({ error: "Commitment is not Privy-managed" }, { status: 400 });
    }

    const creatorPk = new PublicKey(payerWallet);
    
    // Check for claimable WSOL
    const ammClaimable = await getClaimableAmmCreatorFeeLamports({ connection, creator: creatorPk });
    if (ammClaimable.claimableLamports <= 0) {
      return NextResponse.json({ error: "No WSOL fees to claim" }, { status: 400 });
    }

    // Build transaction: create WSOL ATA, claim, close ATA to unwrap
    const creatorWsolAta = getAssociatedTokenAddressSync(WSOL_MINT, creatorPk, true);
    
    const tx = new Transaction();
    const latest = await connection.getLatestBlockhash("confirmed");
    tx.feePayer = feePayer.publicKey;
    tx.recentBlockhash = latest.blockhash;
    tx.lastValidBlockHeight = latest.lastValidBlockHeight;
    
    // Create WSOL ATA if needed
    tx.add(createAssociatedTokenAccountIdempotentInstruction(
      feePayer.publicKey,
      creatorWsolAta,
      creatorPk,
      WSOL_MINT
    ));
    
    // Collect WSOL from AMM vault
    const { ix: ammClaimIx } = buildCollectAmmCreatorFeeInstruction({
      creator: creatorPk,
      destinationWsolAta: creatorWsolAta,
    });
    tx.add(ammClaimIx);
    
    // Close WSOL ATA to unwrap to native SOL
    tx.add(createCloseAccountInstruction(
      creatorWsolAta,
      creatorPk,
      creatorPk,
      [],
      TOKEN_PROGRAM_ID
    ));
    
    tx.partialSign(feePayer);
    
    const txBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    const signed = await privySignSolanaTransaction({ walletId: signerRef.walletId, transactionBase64: txBase64 });
    
    const raw = Buffer.from(String(signed.signedTransactionBase64), "base64");
    const claimSig = await connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "processed", maxRetries: 2 });
    await confirmSignatureViaRpc(connection, claimSig, "confirmed", { timeoutMs: 15000 });
    
    await auditLog("pumpfun_amm_fee_claim_ok", {
      tokenMint: commitment.tokenMint,
      commitmentId: commitment.id,
      creatorWallet: payerWallet,
      wsolAta: ammClaimable.wsolAta.toBase58(),
      claimedLamports: ammClaimable.claimableLamports,
      claimSig,
      source: "manual_dashboard",
    });
    
    return NextResponse.json({ 
      ok: true, 
      signature: claimSig,
      claimedLamports: ammClaimable.claimableLamports,
    });
  } catch (e) {
    const msg = getSafeErrorMessage(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

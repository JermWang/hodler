import { NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";

import { isAdminRequestAsync } from "@/app/lib/adminAuth";
import { verifyAdminOrigin } from "@/app/lib/adminSession";
import { hasDatabase } from "@/app/lib/db";
import { getSafeErrorMessage } from "@/app/lib/safeError";
import { auditLog } from "@/app/lib/auditLog";
import { getConnection, keypairFromBase58Secret } from "@/app/lib/solana";
import { confirmSignatureViaRpc } from "@/app/lib/rpc";
import { 
  getClaimableAmmCreatorFeeLamports,
  buildCollectAmmCreatorFeeInstruction,
  getAmmCreatorVaultWsolAta,
} from "@/app/lib/pumpfun";
import { listCommitments, getEscrowSignerRef } from "@/app/lib/escrowStore";
import { privySignSolanaTransaction } from "@/app/lib/privy";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

export async function GET(req: Request) {
  try {
    verifyAdminOrigin(req);
    const adminOk = await isAdminRequestAsync(req);
    if (!adminOk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const creatorWallet = String(url.searchParams.get("creatorWallet") ?? "").trim();

    if (!creatorWallet) {
      return NextResponse.json({ error: "creatorWallet query param required" }, { status: 400 });
    }

    const connection = getConnection();
    const creatorPk = new PublicKey(creatorWallet);
    const wsolAta = getAmmCreatorVaultWsolAta(creatorPk);

    // Direct query to avoid silent failures
    let claimableLamports = 0;
    let debugInfo: any = {};
    try {
      const tokenData = await connection.getParsedAccountInfo(wsolAta, "confirmed");
      debugInfo.accountExists = !!tokenData?.value;
      if (tokenData?.value) {
        const parsed = (tokenData.value.data as any)?.parsed?.info;
        debugInfo.parsed = !!parsed;
        debugInfo.tokenAmount = parsed?.tokenAmount;
        claimableLamports = Number(parsed?.tokenAmount?.amount ?? 0);
      }
    } catch (rpcErr) {
      debugInfo.rpcError = String(rpcErr);
    }

    return NextResponse.json({
      ok: true,
      creatorWallet,
      wsolVaultAta: wsolAta.toBase58(),
      claimableLamports,
      claimableSol: claimableLamports / 1e9,
      debug: debugInfo,
    });
  } catch (e) {
    const msg = getSafeErrorMessage(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    verifyAdminOrigin(req);
    const adminOk = await isAdminRequestAsync(req);
    if (!adminOk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const creatorWallet = String(body?.creatorWallet ?? "").trim();

    if (!creatorWallet) {
      return NextResponse.json({ error: "creatorWallet required" }, { status: 400 });
    }

    const feePayerSecret = String(process.env.ESCROW_FEE_PAYER_SECRET_KEY ?? "").trim();
    if (!feePayerSecret) {
      return NextResponse.json({ error: "Fee payer not configured" }, { status: 500 });
    }

    const feePayer = keypairFromBase58Secret(feePayerSecret);
    const connection = getConnection();

    // Find the commitment for this creator wallet (including archived)
    const commitments = (await listCommitments()).filter(
      (c) => c.kind === "creator_reward" && c.creatorFeeMode === "managed" && Boolean(c.tokenMint)
    );

    const commitment = commitments.find((c) => String(c.authority ?? "").trim() === creatorWallet);
    if (!commitment) {
      return NextResponse.json({ error: "No managed commitment found for this wallet" }, { status: 404 });
    }

    const signerRef = getEscrowSignerRef(commitment as any);
    if (signerRef.kind !== "privy") {
      return NextResponse.json({ error: "Commitment is not Privy-managed" }, { status: 400 });
    }

    const creatorPk = new PublicKey(creatorWallet);
    
    // Check for claimable WSOL
    const ammClaimable = await getClaimableAmmCreatorFeeLamports({ connection, creator: creatorPk });
    if (ammClaimable.claimableLamports <= 0) {
      return NextResponse.json({ error: "No WSOL fees to claim", claimableLamports: 0 }, { status: 400 });
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
    
    await auditLog("admin_wsol_claim_ok", {
      tokenMint: commitment.tokenMint,
      commitmentId: commitment.id,
      creatorWallet,
      wsolAta: ammClaimable.wsolAta.toBase58(),
      claimedLamports: ammClaimable.claimableLamports,
      claimSig,
    });
    
    return NextResponse.json({ 
      ok: true, 
      signature: claimSig,
      claimedLamports: ammClaimable.claimableLamports,
      claimedSol: ammClaimable.claimableLamports / 1e9,
    });
  } catch (e) {
    const msg = getSafeErrorMessage(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

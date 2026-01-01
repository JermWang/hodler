import { NextResponse } from "next/server";
import { Keypair, PublicKey } from "@solana/web3.js";
import crypto from "crypto";

import { checkRateLimit } from "../../lib/rateLimit";
import { getSafeErrorMessage } from "../../lib/safeError";
import { getConnection } from "../../lib/solana";
import { privyCreateSolanaWallet, privySignAndSendSolanaTransaction } from "../../lib/privy";
import { buildUnsignedPumpfunCreateV2Tx } from "../../lib/pumpfun";
import { createRewardCommitmentRecord, insertCommitment } from "../../lib/escrowStore";

export const runtime = "nodejs";

const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"; // mainnet

/**
 * POST /api/launch
 * 
 * Automated token launch flow:
 * 1. Creates a Privy-managed wallet (platform-controlled creator wallet)
 * 2. Uploads metadata to IPFS via Pump.fun
 * 3. Launches token on Pump.fun with the platform wallet as creator
 * 4. Creates a commitment record with milestones
 * 5. The platform wallet receives creator fees, which we auto-escrow
 */
export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "launch:post", limit: 5, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const body = (await req.json()) as any;

    // Validate required fields
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const statement = typeof body.statement === "string" ? body.statement.trim() : "";
    const payoutWallet = typeof body.payoutWallet === "string" ? body.payoutWallet.trim() : "";

    if (!name) return NextResponse.json({ error: "Token name is required" }, { status: 400 });
    if (!symbol) return NextResponse.json({ error: "Token symbol is required" }, { status: 400 });
    if (!imageUrl) return NextResponse.json({ error: "Token image is required" }, { status: 400 });
    if (!payoutWallet) return NextResponse.json({ error: "Payout wallet is required" }, { status: 400 });

    // Validate payout wallet
    let payoutPubkey: PublicKey;
    try {
      payoutPubkey = new PublicKey(payoutWallet);
    } catch {
      return NextResponse.json({ error: "Invalid payout wallet address" }, { status: 400 });
    }

    // Validate milestones
    const rawMilestones = Array.isArray(body.milestones) ? body.milestones : [];
    if (rawMilestones.length === 0) {
      return NextResponse.json({ error: "At least one milestone is required" }, { status: 400 });
    }
    if (rawMilestones.length > 12) {
      return NextResponse.json({ error: "Maximum 12 milestones allowed" }, { status: 400 });
    }

    const milestones = rawMilestones.map((m: any, idx: number) => {
      const title = typeof m?.title === "string" ? m.title.trim() : "";
      const unlockLamports = Number(m?.unlockLamports);
      if (!title.length) throw new Error(`Milestone ${idx + 1}: title required`);
      if (title.length > 80) throw new Error(`Milestone ${idx + 1}: title too long (max 80 chars)`);
      if (!Number.isFinite(unlockLamports) || unlockLamports <= 0) throw new Error(`Milestone ${idx + 1}: invalid unlock amount`);
      const id = crypto.randomBytes(8).toString("hex");
      return { id, title, unlockLamports: Math.floor(unlockLamports) };
    });

    // Optional social links
    const websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
    const xUrl = typeof body.xUrl === "string" ? body.xUrl.trim() : "";
    const telegramUrl = typeof body.telegramUrl === "string" ? body.telegramUrl.trim() : "";
    const discordUrl = typeof body.discordUrl === "string" ? body.discordUrl.trim() : "";
    const bannerUrl = typeof body.bannerUrl === "string" ? body.bannerUrl.trim() : "";

    // Dev buy amount (optional, defaults to 0.01 SOL)
    const devBuySol = Number(body.devBuySol ?? 0.01);
    const devBuyLamports = Math.floor(devBuySol * 1_000_000_000);

    // Step 1: Create Privy-managed wallet for the token creator
    const { walletId, address: creatorWalletAddress } = await privyCreateSolanaWallet();
    const creatorPubkey = new PublicKey(creatorWalletAddress);

    // Step 2: Upload metadata to IPFS via Pump.fun
    const metadataFormData = new FormData();
    metadataFormData.append("name", name);
    metadataFormData.append("symbol", symbol);
    metadataFormData.append("description", description);
    metadataFormData.append("showName", "true");
    if (websiteUrl) metadataFormData.append("website", websiteUrl);
    if (xUrl) metadataFormData.append("twitter", xUrl);
    if (telegramUrl) metadataFormData.append("telegram", telegramUrl);

    // Fetch image and add to form
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch token image" }, { status: 400 });
    }
    const imageBlob = await imageResponse.blob();
    metadataFormData.append("file", imageBlob, "token.png");

    const ipfsResponse = await fetch("https://pump.fun/api/ipfs", {
      method: "POST",
      body: metadataFormData,
    });

    if (!ipfsResponse.ok) {
      const ipfsError = await ipfsResponse.text().catch(() => "Unknown error");
      return NextResponse.json({ error: `Failed to upload metadata: ${ipfsError}` }, { status: 500 });
    }

    const ipfsJson = await ipfsResponse.json();
    const metadataUri = ipfsJson?.metadataUri;
    if (!metadataUri) {
      return NextResponse.json({ error: "Failed to get metadata URI from Pump.fun" }, { status: 500 });
    }

    // Step 3: Generate mint keypair and build transaction
    const connection = getConnection();
    const mintKeypair = Keypair.generate();

    const { tx, bondingCurve } = await buildUnsignedPumpfunCreateV2Tx({
      connection,
      user: creatorPubkey,
      mint: mintKeypair.publicKey,
      name,
      symbol,
      uri: metadataUri,
      creator: creatorPubkey,
      isMayhemMode: false,
      spendableSolInLamports: BigInt(devBuyLamports),
      minTokensOut: 0n,
      computeUnitLimit: 300_000,
      computeUnitPriceMicroLamports: 100_000,
    });

    // Sign with mint keypair (we control this locally)
    tx.partialSign(mintKeypair);

    // Step 4: Send transaction via Privy (they sign with the creator wallet)
    const txBase64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
    
    const { signature: launchTxSig } = await privySignAndSendSolanaTransaction({
      walletId,
      caip2: SOLANA_CAIP2,
      transactionBase64: txBase64,
    });

    // Step 5: Create commitment record
    const commitmentId = crypto.randomBytes(16).toString("hex");
    const escrowPubkey = creatorPubkey.toBase58();

    const baseRecord = createRewardCommitmentRecord({
      id: commitmentId,
      statement: statement || `Lock creator fees for ${name}. Ship milestones, release on-chain.`,
      creatorPubkey: payoutPubkey.toBase58(), // User's payout wallet
      escrowPubkey,
      escrowSecretKeyB58: `privy:${walletId}`, // Reference to Privy wallet
      milestones,
      tokenMint: mintKeypair.publicKey.toBase58(),
      creatorFeeMode: "managed",
    });

    const record = {
      ...baseRecord,
      authority: creatorPubkey.toBase58(),
      destinationOnFail: payoutPubkey.toBase58(),
    };

    await insertCommitment(record);

    // TODO: Save project profile with social links and banner

    return NextResponse.json({
      ok: true,
      commitmentId,
      tokenMint: mintKeypair.publicKey.toBase58(),
      creatorWallet: creatorWalletAddress,
      payoutWallet: payoutPubkey.toBase58(),
      bondingCurve: bondingCurve.toBase58(),
      launchTxSig,
      metadataUri,
      escrowPubkey,
    });

  } catch (e) {
    console.error("Launch error:", e);
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

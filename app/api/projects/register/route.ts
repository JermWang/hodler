import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import crypto from "crypto";

import { getPool, hasDatabase } from "@/app/lib/db";
import {
  getConnection,
  verifyTokenExistsOnChain,
  getTokenSupplyForMint,
  getMintAuthorityBase58,
  getTokenMetadataUpdateAuthorityBase58,
} from "@/app/lib/solana";
import { auditLog } from "@/app/lib/auditLog";

export const runtime = "nodejs";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * POST /api/projects/register
 * 
 * Register an existing token/project for manual lock-up campaigns.
 * Requires signature from the token creator wallet to prove ownership.
 */
export async function POST(req: NextRequest) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const body = await req.json();
    const {
      tokenMint,
      creatorPubkey,
      name,
      symbol,
      description,
      imageUrl,
      websiteUrl,
      twitterHandle,
      discordUrl,
      telegramUrl,
      signature,
      timestamp,
    } = body;

    // Validate required fields
    if (!tokenMint || !creatorPubkey || !name || !symbol) {
      return NextResponse.json(
        { error: "tokenMint, creatorPubkey, name, and symbol are required" },
        { status: 400 }
      );
    }

    // Validate timestamp
    const timestampUnix = parseInt(timestamp, 10);
    const nowUnix = Math.floor(Date.now() / 1000);
    if (Math.abs(nowUnix - timestampUnix) > 300) {
      return NextResponse.json({ error: "Signature timestamp expired" }, { status: 400 });
    }

    // Validate pubkeys
    let creatorPk: PublicKey;
    let mintPk: PublicKey;
    try {
      creatorPk = new PublicKey(String(creatorPubkey));
      mintPk = new PublicKey(String(tokenMint));
    } catch {
      return NextResponse.json({ error: "Invalid creatorPubkey or tokenMint" }, { status: 400 });
    }

    // Verify signature
    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(String(signature));
    } catch {
      return NextResponse.json({ error: "Invalid signature encoding" }, { status: 400 });
    }

    const msg = `AmpliFi\nRegister Project\nToken: ${mintPk.toBase58()}\nCreator: ${creatorPk.toBase58()}\nTimestamp: ${timestampUnix}`;
    const ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), sigBytes, creatorPk.toBytes());
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Verify token exists on-chain
    const creatorB58 = creatorPk.toBase58();
    let connection = getConnection();

    let tokenInfo = await verifyTokenExistsOnChain({ connection, mint: mintPk });
    for (let attempt = 0; attempt < 3 && (!tokenInfo.exists || !tokenInfo.isMintAccount); attempt++) {
      await sleep(1200 + attempt * 900);
      connection = getConnection();
      tokenInfo = await verifyTokenExistsOnChain({ connection, mint: mintPk });
    }

    if (!tokenInfo.exists || !tokenInfo.isMintAccount) {
      return NextResponse.json(
        { error: "Token not found on-chain or is not a valid SPL token mint" },
        { status: 400 }
      );
    }

    const supplyInfo = await getTokenSupplyForMint({ connection, mint: mintPk });

    let mintAuthority = await getMintAuthorityBase58({ connection, mint: mintPk }).catch(() => null);
    let updateAuthority = await getTokenMetadataUpdateAuthorityBase58({ connection, mint: mintPk }).catch(() => null);
    for (let attempt = 0; attempt < 2 && !updateAuthority; attempt++) {
      await sleep(700 + attempt * 700);
      connection = getConnection();
      mintAuthority = await getMintAuthorityBase58({ connection, mint: mintPk }).catch(() => mintAuthority);
      updateAuthority = await getTokenMetadataUpdateAuthorityBase58({ connection, mint: mintPk }).catch(() => updateAuthority);
    }

    const hasAuthority = mintAuthority === creatorB58 || updateAuthority === creatorB58;
    let okOwnership = hasAuthority;

    if (!okOwnership) {
      const pool = getPool();
      const launched = await pool.query(
        "select id from public.commitments where token_mint=$1 and creator_pubkey=$2 and kind='creator_reward' limit 1",
        [mintPk.toBase58(), creatorB58]
      );
      okOwnership = Boolean(launched.rows?.[0]);
    }

    if (!okOwnership) {
      return NextResponse.json(
        {
          error: "Project ownership verification failed",
          creatorPubkey: creatorB58,
          mintAuthority,
          updateAuthority,
        },
        { status: 403 }
      );
    }

    const pool = getPool();
    const id = crypto.randomUUID();

    // Upsert project profile
    await pool.query(
      `INSERT INTO public.project_profiles 
       (token_mint, name, symbol, description, image_url, website_url, twitter_handle, 
        discord_url, telegram_url, creator_pubkey, decimals, total_supply, created_at_unix, updated_at_unix)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (token_mint) DO UPDATE SET
         name = EXCLUDED.name,
         symbol = EXCLUDED.symbol,
         description = EXCLUDED.description,
         image_url = EXCLUDED.image_url,
         website_url = EXCLUDED.website_url,
         twitter_handle = EXCLUDED.twitter_handle,
         discord_url = EXCLUDED.discord_url,
         telegram_url = EXCLUDED.telegram_url,
         creator_pubkey = EXCLUDED.creator_pubkey,
         decimals = EXCLUDED.decimals,
         total_supply = EXCLUDED.total_supply,
         updated_at_unix = EXCLUDED.updated_at_unix`,
      [
        tokenMint,
        name.trim().slice(0, 64),
        symbol.trim().toUpperCase().slice(0, 10),
        description?.trim()?.slice(0, 500) || null,
        imageUrl?.trim() || null,
        websiteUrl?.trim() || null,
        twitterHandle?.trim()?.replace(/^@/, "") || null,
        discordUrl?.trim() || null,
        telegramUrl?.trim() || null,
        creatorPubkey,
        supplyInfo.decimals,
        supplyInfo.amountRaw.toString(),
        nowUnix,
        nowUnix,
      ]
    );

    await auditLog("project_registered", {
      tokenMint,
      creatorPubkey,
      name,
      symbol,
      decimals: supplyInfo.decimals,
    });

    return NextResponse.json({
      success: true,
      project: {
        tokenMint,
        creatorPubkey,
        name: name.trim().slice(0, 64),
        symbol: symbol.trim().toUpperCase().slice(0, 10),
        description: description?.trim()?.slice(0, 500) || null,
        imageUrl: imageUrl?.trim() || null,
        decimals: supplyInfo.decimals,
        totalSupply: supplyInfo.amountRaw.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to register project:", error);
    return NextResponse.json(
      { error: "Failed to register project" },
      { status: 500 }
    );
  }
}

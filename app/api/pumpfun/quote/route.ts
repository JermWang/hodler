import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

import { getBondingCurvePda } from "../../../lib/pumpfun";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";

export const runtime = "nodejs";

const RPC_URL = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

function getConnection(): Connection {
  return new Connection(RPC_URL, { commitment: "confirmed" });
}

// Bonding curve account layout offsets
const VIRTUAL_TOKEN_RESERVES_OFFSET = 8;
const VIRTUAL_SOL_RESERVES_OFFSET = 16;
const REAL_TOKEN_RESERVES_OFFSET = 24;
const REAL_SOL_RESERVES_OFFSET = 32;

function readU64LE(data: Buffer, offset: number): bigint {
  return data.readBigUInt64LE(offset);
}

export async function GET(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "pumpfun:quote", limit: 30, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const url = new URL(req.url);
    const tokenMint = url.searchParams.get("tokenMint")?.trim() || "";
    const solAmountStr = url.searchParams.get("solAmount")?.trim() || "0";
    const solAmount = parseFloat(solAmountStr);

    if (!tokenMint) {
      return NextResponse.json({ error: "tokenMint is required" }, { status: 400 });
    }
    if (!solAmount || solAmount <= 0) {
      return NextResponse.json({ error: "solAmount must be > 0" }, { status: 400 });
    }

    let mintKey: PublicKey;
    try {
      mintKey = new PublicKey(tokenMint);
    } catch {
      return NextResponse.json({ error: "Invalid token mint" }, { status: 400 });
    }

    const connection = getConnection();
    const bondingCurve = getBondingCurvePda(mintKey);
    
    const accountInfo = await connection.getAccountInfo(bondingCurve);
    if (!accountInfo || !accountInfo.data) {
      return NextResponse.json({ error: "Bonding curve not found - token may not exist on pump.fun" }, { status: 404 });
    }

    const data = accountInfo.data;
    const virtualTokenReserves = readU64LE(data as Buffer, VIRTUAL_TOKEN_RESERVES_OFFSET);
    const virtualSolReserves = readU64LE(data as Buffer, VIRTUAL_SOL_RESERVES_OFFSET);
    const realTokenReserves = readU64LE(data as Buffer, REAL_TOKEN_RESERVES_OFFSET);
    const realSolReserves = readU64LE(data as Buffer, REAL_SOL_RESERVES_OFFSET);

    const solLamports = BigInt(Math.floor(solAmount * 1e9));
    
    // Apply 1% fee
    const fee = (solLamports * 100n) / 10000n;
    const solAfterFee = solLamports - fee;
    
    // AMM formula: tokens_out = (sol_in * virtual_token_reserves) / (virtual_sol_reserves + sol_in)
    const tokensOut = (solAfterFee * virtualTokenReserves) / (virtualSolReserves + solAfterFee);
    
    // Convert to human readable (6 decimals for pump.fun tokens)
    const tokensOutFormatted = Number(tokensOut) / 1e6;
    const feeFormatted = Number(fee) / 1e9;

    // Calculate price impact
    const priceBeforeSol = Number(virtualSolReserves) / Number(virtualTokenReserves);
    const newVirtualSol = virtualSolReserves + solAfterFee;
    const newVirtualTokens = virtualTokenReserves - tokensOut;
    const priceAfterSol = Number(newVirtualSol) / Number(newVirtualTokens);
    const priceImpactPercent = ((priceAfterSol - priceBeforeSol) / priceBeforeSol) * 100;

    return NextResponse.json({
      ok: true,
      tokenMint,
      solAmount,
      solLamports: solLamports.toString(),
      expectedTokens: tokensOut.toString(),
      expectedTokensFormatted: tokensOutFormatted.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      feeSol: feeFormatted,
      priceImpactPercent: priceImpactPercent.toFixed(2),
      bondingCurve: bondingCurve.toBase58(),
      reserves: {
        virtualTokenReserves: virtualTokenReserves.toString(),
        virtualSolReserves: virtualSolReserves.toString(),
        realTokenReserves: realTokenReserves.toString(),
        realSolReserves: realSolReserves.toString(),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

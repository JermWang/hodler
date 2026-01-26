import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { BondingCurveState, getBondingCurveState } from "../../../lib/pumpfun";
import { checkRateLimit } from "../../../lib/rateLimit";
import { auditLog } from "../../../lib/auditLog";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { withRpcFallback } from "../../../lib/rpc";

export const runtime = "nodejs";

const TOKEN_DECIMALS = 6n;
const TOKEN_DECIMALS_FACTOR = 1_000_000n;

function formatTokenAmount(raw: bigint, maxFractionDigits = 2): string {
  const whole = raw / TOKEN_DECIMALS_FACTOR;
  const frac = raw % TOKEN_DECIMALS_FACTOR;
  if (frac === 0n || maxFractionDigits <= 0) return whole.toString();
  const fracStr = frac.toString().padStart(Number(TOKEN_DECIMALS), "0");
  const trimmed = fracStr.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${whole.toString()}.${trimmed}` : whole.toString();
}

async function fetchBondingCurveState(mint: PublicKey): Promise<BondingCurveState> {
  return withRpcFallback(async (connection) => getBondingCurveState({ connection, mint }));
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

    let curve: BondingCurveState;
    try {
      curve = await fetchBondingCurveState(mintKey);
    } catch (err) {
      const msg = String((err as Error)?.message ?? err).toLowerCase();
      if (msg.includes("not found") || msg.includes("invalid")) {
        return NextResponse.json({ error: "Bonding curve not found - token may not exist on pump.fun" }, { status: 404 });
      }
      throw err;
    }

    const virtualTokenReserves = BigInt(curve.virtualTokenReserves);
    const virtualSolReserves = BigInt(curve.virtualSolReserves);
    const realTokenReserves = BigInt(curve.realTokenReserves);
    const realSolReserves = BigInt(curve.realSolReserves);

    const solLamports = BigInt(Math.floor(solAmount * 1e9));
    
    // Apply 1% fee
    const fee = (solLamports * 100n) / 10000n;
    const solAfterFee = solLamports - fee;
    
    // AMM formula: tokens_out = (sol_in * virtual_token_reserves) / (virtual_sol_reserves + sol_in)
    const tokensOut = (solAfterFee * virtualTokenReserves) / (virtualSolReserves + solAfterFee);
    
    // Convert to human readable (6 decimals for pump.fun tokens)
    const tokensOutFormatted = formatTokenAmount(tokensOut, 2);
    const feeFormatted = Number(fee) / 1e9;

    // Calculate price impact
    const newVirtualSol = virtualSolReserves + solAfterFee;
    const newVirtualTokens = virtualTokenReserves - tokensOut;
    const priceBeforeSol = Number(virtualSolReserves) / Number(virtualTokenReserves || 1n);
    const priceAfterSol = Number(newVirtualSol) / Number(newVirtualTokens || 1n);
    const priceImpactPercent = Number.isFinite(priceBeforeSol) && priceBeforeSol > 0 && Number.isFinite(priceAfterSol)
      ? ((priceAfterSol - priceBeforeSol) / priceBeforeSol) * 100
      : null;

    return NextResponse.json({
      ok: true,
      tokenMint,
      solAmount,
      solLamports: solLamports.toString(),
      expectedTokens: tokensOut.toString(),
      expectedTokensFormatted: tokensOutFormatted,
      feeSol: feeFormatted,
      priceImpactPercent: priceImpactPercent != null && Number.isFinite(priceImpactPercent) ? priceImpactPercent.toFixed(2) : null,
      bondingCurve: curve.bondingCurvePda,
      reserves: {
        virtualTokenReserves: virtualTokenReserves.toString(),
        virtualSolReserves: virtualSolReserves.toString(),
        realTokenReserves: realTokenReserves.toString(),
        realSolReserves: realSolReserves.toString(),
      },
    });
  } catch (e) {
    const safe = getSafeErrorMessage(e);
    await auditLog("pumpfun_quote_error", {
      error: safe,
      rawError: String((e as any)?.message ?? e),
      url: String((req as any)?.url ?? ""),
    });
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}

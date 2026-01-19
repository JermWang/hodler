import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { auditLog } from "../../../lib/auditLog";
import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { checkRateLimit } from "../../../lib/rateLimit";
import { hasDatabase, getPool } from "../../../lib/db";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { listCommitments, getEscrowSignerRef } from "../../../lib/escrowStore";
import { updateFeeShares } from "../../../lib/bags";

export const runtime = "nodejs";

function isCronAuthorized(req: Request): boolean {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;
  const header = String(req.headers.get("x-cron-secret") ?? "").trim();
  if (!header) return false;
  return header === secret;
}

function asInt(v: unknown, fallback: number): number {
  const n = Number(v);
  if (Number.isFinite(n)) return Math.floor(n);
  return fallback;
}

function pickUniqueTopN(input: Array<{ walletPubkey: string; score: number }>, opts: { exclude: Set<string>; n: number }): Array<{ walletPubkey: string; score: number }> {
  const out: Array<{ walletPubkey: string; score: number }> = [];
  const seen = new Set<string>();
  for (const row of input) {
    const w = String(row.walletPubkey ?? "").trim();
    if (!w) continue;
    if (opts.exclude.has(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push({ walletPubkey: w, score: Number(row.score ?? 0) || 0 });
    if (out.length >= opts.n) break;
  }
  return out;
}

function allocateEqualBps(totalBps: number, wallets: string[]): Array<{ wallet: string; bps: number }> {
  const n = wallets.length;
  if (n <= 0) return [];
  const base = Math.floor(totalBps / n);
  let rem = totalBps - base * n;
  return wallets.map((w) => {
    const bps = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
    return { wallet: w, bps };
  });
}

function allocateSqrtWeightedBps(totalBps: number, items: Array<{ wallet: string; score: number }>): Array<{ wallet: string; bps: number }> {
  const cleaned = items.filter((x) => x.wallet && Number.isFinite(x.score) && x.score > 0);
  if (cleaned.length === 0) return allocateEqualBps(totalBps, items.map((x) => x.wallet));

  const weights = cleaned.map((x) => Math.sqrt(Math.max(0, x.score)));
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(sum) || sum <= 0) return allocateEqualBps(totalBps, cleaned.map((x) => x.wallet));

  const provisional = cleaned.map((x, i) => {
    const raw = (weights[i] / sum) * totalBps;
    const bps = Math.floor(raw);
    return { wallet: x.wallet, bps, frac: raw - bps };
  });

  let used = provisional.reduce((a, b) => a + b.bps, 0);
  let rem = totalBps - used;
  provisional.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < provisional.length && rem > 0; i++) {
    provisional[i].bps += 1;
    rem -= 1;
  }

  return provisional
    .sort((a, b) => a.wallet.localeCompare(b.wallet))
    .map(({ wallet, bps }) => ({ wallet, bps }));
}

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "admin:bags-rotate-fee-shares", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const cronOk = isCronAuthorized(req);
    if (!cronOk) {
      verifyAdminOrigin(req);
      if (!(await isAdminRequestAsync(req))) {
        await auditLog("admin_bags_rotate_fee_shares_denied", {});
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = (await req.json().catch(() => null)) as any;

    const tokenMintFilter = typeof body?.tokenMint === "string" ? body.tokenMint.trim() : "";
    const dryRun = Boolean(body?.dryRun);
    const limit = Math.max(1, Math.min(100, asInt(body?.limit, 50)));

    const windowSeconds = Math.max(60, Math.min(60 * 60 * 24 * 30, asInt(body?.windowSeconds, 7 * 24 * 60 * 60)));
    const raiderCountTarget = Math.max(1, Math.min(14, asInt(body?.raiderCount, 14)));
    const mode = String(body?.mode ?? "sqrt").trim().toLowerCase();

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    const sinceUnix = nowUnix - windowSeconds;

    const commitments = await listCommitments();
    const targets = commitments
      .filter((c) => c.kind === "creator_reward" && c.creatorFeeMode === "managed" && (c.status === "active" || c.status === "created"))
      .filter((c) => (tokenMintFilter ? String(c.tokenMint ?? "").trim() === tokenMintFilter : true))
      .filter((c) => String(c.tokenMint ?? "").trim().length > 0)
      .slice(0, limit);

    const pool = getPool();

    const results: any[] = [];

    for (const c of targets) {
      const tokenMint = String(c.tokenMint ?? "").trim();
      const payerPubkey = String(c.escrowPubkey ?? "").trim();

      try {
        const mint = new PublicKey(tokenMint).toBase58();
        const payer = new PublicKey(payerPubkey).toBase58();

        const signer = getEscrowSignerRef(c);
        if (signer.kind !== "privy") {
          results.push({ tokenMint: mint, ok: false, error: "Commitment escrow signer is not Privy-managed" });
          continue;
        }

        const campaignRes = await pool.query(
          `select id from public.campaigns
           where token_mint=$1 and status='active' and start_at_unix <= $2 and end_at_unix > $2
           order by created_at_unix desc
           limit 1`,
          [mint, nowUnix]
        );

        const campaignId = String(campaignRes.rows?.[0]?.id ?? "").trim();
        if (!campaignId) {
          results.push({ tokenMint: mint, ok: true, skipped: true, reason: "no_active_campaign" });
          continue;
        }

        const scoresRes = await pool.query(
          `select wallet_pubkey, sum(final_score) as total_score
           from public.engagement_events
           where campaign_id=$1 and created_at_unix >= $2 and is_duplicate=false and is_spam=false
           group by wallet_pubkey
           order by total_score desc
           limit $3`,
          [campaignId, sinceUnix, Math.max(50, raiderCountTarget * 8)]
        );

        const exclude = new Set<string>();
        exclude.add(payer);
        if (c.creatorPubkey) exclude.add(String(c.creatorPubkey));
        if (c.authority) exclude.add(String(c.authority));
        if (c.destinationOnFail) exclude.add(String(c.destinationOnFail));
        if (c.escrowPubkey) exclude.add(String(c.escrowPubkey));

        const scored = (scoresRes.rows ?? []).map((r: any) => ({
          walletPubkey: String(r.wallet_pubkey ?? "").trim(),
          score: Number(r.total_score ?? 0) || 0,
        }));

        const picked = pickUniqueTopN(scored, { exclude, n: raiderCountTarget });

        let weights: Array<{ wallet: string; bps: number }> = [];

        if (picked.length === 0) {
          weights = [{ wallet: payer, bps: 10000 }];
        } else {
          const raiderBpsTotal = 5000;
          const raiders = picked.map((p) => ({ wallet: p.walletPubkey, score: p.score }));

          const raiderWeights =
            mode === "equal" ? allocateEqualBps(raiderBpsTotal, raiders.map((r) => r.wallet)) : allocateSqrtWeightedBps(raiderBpsTotal, raiders);

          const raiderSum = raiderWeights.reduce((s, x) => s + x.bps, 0);
          const creatorBps = 10000 - raiderSum;

          weights = [{ wallet: payer, bps: creatorBps }, ...raiderWeights];
        }

        if (dryRun) {
          results.push({ tokenMint: mint, ok: true, dryRun: true, campaignId, sinceUnix, payer: payer, weights });
          continue;
        }

        const r = await updateFeeShares(mint, weights, signer.walletId, payer);
        if (!r.ok) {
          await auditLog("admin_bags_rotate_fee_shares_error", { tokenMint: mint, error: r.error ?? "Unknown" });
          results.push({ tokenMint: mint, ok: false, error: r.error ?? "Unknown" });
          continue;
        }

        await auditLog("admin_bags_rotate_fee_shares_ok", { tokenMint: mint, configKey: r.configKey ?? null, weightsCount: weights.length });
        results.push({ tokenMint: mint, ok: true, configKey: r.configKey ?? null, weightsCount: weights.length, raiders: weights.length - 1 });
      } catch (e) {
        const msg = getSafeErrorMessage(e);
        await auditLog("admin_bags_rotate_fee_shares_error", { tokenMint, error: msg });
        results.push({ tokenMint, ok: false, error: msg });
      }
    }

    await auditLog("admin_bags_rotate_fee_shares_completed", { cron: cronOk, count: results.length, dryRun });

    return NextResponse.json({ ok: true, nowUnix, sinceUnix, dryRun, results });
  } catch (e) {
    await auditLog("admin_bags_rotate_fee_shares_error", { error: getSafeErrorMessage(e) });
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

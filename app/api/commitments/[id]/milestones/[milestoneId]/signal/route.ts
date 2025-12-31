import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

import {
  RewardMilestone,
  getCommitment,
  getRewardApprovalThreshold,
  getRewardMilestoneApprovalCounts,
  normalizeRewardMilestonesClaimable,
  publicView,
  updateRewardTotalsAndMilestones,
  upsertRewardMilestoneSignal,
  upsertRewardVoterSnapshot,
} from "../../../../../../lib/escrowStore";
import { getChainUnixTime, getConnection, getTokenBalanceForMint, hasAnyTokenBalanceForMint } from "../../../../../../lib/solana";
import { getCachedJupiterPriceUsd, setCachedJupiterPriceUsd } from "../../../../../../lib/priceCache";
import { checkRateLimit } from "../../../../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../../../../lib/safeError";

export const runtime = "nodejs";

function milestoneSignalMessage(input: { commitmentId: string; milestoneId: string }): string {
  return `Commit To Ship\nMilestone Approval Signal\nCommitment: ${input.commitmentId}\nMilestone: ${input.milestoneId}`;
}

function getVoteCutoffSeconds(): number {
  const raw = Number(process.env.REWARD_VOTE_CUTOFF_SECONDS ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 24 * 60 * 60;
}

function shipMultiplierBpsFromUiAmount(shipUiAmount: number): number {
  if (!Number.isFinite(shipUiAmount) || shipUiAmount <= 0) return 10000;
  if (shipUiAmount >= 10_000_000) return 20000;
  if (shipUiAmount >= 100_000) return 13000;
  return 10000;
}

async function getJupiterUsdPriceForMint(mint: string): Promise<number | null> {
  const url = `https://price.jup.ag/v4/price?ids=${encodeURIComponent(mint)}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as any;
  const price = json?.data?.[mint]?.price;
  if (typeof price === "number" && Number.isFinite(price) && price > 0) return price;
  return null;
}

export async function POST(req: Request, ctx: { params: { id: string; milestoneId: string } }) {
  const id = ctx.params.id;
  const milestoneId = ctx.params.milestoneId;

  const body = (await req.json().catch(() => null)) as any;

  try {
    const rl = checkRateLimit(req, { keyPrefix: "milestone:signal", limit: 20, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const record = await getCommitment(id);
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (record.kind !== "creator_reward") {
      return NextResponse.json({ error: "Not a reward commitment" }, { status: 400 });
    }

    if (!record.tokenMint) {
      return NextResponse.json({ error: "Token mint required for holder voting" }, { status: 400 });
    }

    const signerB58 = typeof body?.signerPubkey === "string" ? body.signerPubkey.trim() : "";
    if (!signerB58) {
      return NextResponse.json({ error: "signerPubkey required" }, { status: 400 });
    }

    const signatureB58 = typeof body?.signature === "string" ? body.signature.trim() : "";
    if (!signatureB58) {
      const message = milestoneSignalMessage({ commitmentId: id, milestoneId });
      return NextResponse.json(
        {
          error: "signature required",
          message,
          signerPubkey: signerB58,
        },
        { status: 400 }
      );
    }

    const expectedMessage = milestoneSignalMessage({ commitmentId: id, milestoneId });
    const providedMessage = typeof body?.message === "string" ? body.message : expectedMessage;
    if (providedMessage !== expectedMessage) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }

    const signature = bs58.decode(signatureB58);
    const signerPk = new PublicKey(signerB58);

    const ok = nacl.sign.detached.verify(new TextEncoder().encode(expectedMessage), signature, signerPk.toBytes());
    if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

    const milestones: RewardMilestone[] = Array.isArray(record.milestones) ? (record.milestones.slice() as RewardMilestone[]) : [];
    const idx = milestones.findIndex((m: RewardMilestone) => m.id === milestoneId);
    if (idx < 0) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

    const milestone = milestones[idx];
    if (milestone.status === "released") {
      return NextResponse.json({ error: "Milestone already released" }, { status: 409 });
    }
    if (milestone.completedAtUnix == null) {
      return NextResponse.json({ error: "Milestone not marked complete yet" }, { status: 400 });
    }

    const connection = getConnection();
    const nowUnix = await getChainUnixTime(connection);

    const cutoffSeconds = getVoteCutoffSeconds();
    const completedAtUnix = Number(milestone.completedAtUnix ?? 0);
    const voteCutoffUnix = completedAtUnix > 0 ? completedAtUnix + cutoffSeconds : 0;
    const withinCutoff = voteCutoffUnix > 0 ? nowUnix <= voteCutoffUnix : false;

    let projectUiAmount = 0;
    let shipUiAmount = 0;
    let shipMultiplierBps = 10000;

    if (record.tokenMint) {
      const mintPk = new PublicKey(record.tokenMint);

      const isHolder = await hasAnyTokenBalanceForMint({ connection, owner: signerPk, mint: mintPk });
      if (!isHolder) return NextResponse.json({ error: "Signer is not a token holder" }, { status: 403 });

      const minUsd = 20;
      const bal = await getTokenBalanceForMint({ connection, owner: signerPk, mint: mintPk });
      if (bal.uiAmount <= 0) return NextResponse.json({ error: "Signer has no token balance" }, { status: 403 });

      projectUiAmount = bal.uiAmount;

      const mintB58 = mintPk.toBase58();
      let priceUsd = await getCachedJupiterPriceUsd(mintB58);
      if (priceUsd == null) {
        priceUsd = await getJupiterUsdPriceForMint(mintB58);
        if (priceUsd != null) {
          await setCachedJupiterPriceUsd(mintB58, priceUsd);
        }
      }

      if (priceUsd == null) {
        return NextResponse.json({ error: "Unable to fetch token USD price for voting" }, { status: 503 });
      }

      const valueUsd = bal.uiAmount * priceUsd;
      if (!Number.isFinite(valueUsd) || valueUsd <= minUsd) {
        return NextResponse.json(
          {
            error: "Token holdings below minimum required value to vote",
            minUsd,
            priceUsd,
            uiAmount: bal.uiAmount,
            valueUsd,
          },
          { status: 403 }
        );
      }

      const shipMint = String(process.env.CTS_SHIP_TOKEN_MINT ?? "").trim();
      if (shipMint.length) {
        try {
          const shipMintPk = new PublicKey(shipMint);
          const shipBal = await getTokenBalanceForMint({ connection, owner: signerPk, mint: shipMintPk });
          shipUiAmount = shipBal.uiAmount;
          shipMultiplierBps = shipMultiplierBpsFromUiAmount(shipUiAmount);
        } catch {
          shipUiAmount = 0;
          shipMultiplierBps = 10000;
        }
      }
    }

    const { inserted } = await upsertRewardMilestoneSignal({
      commitmentId: id,
      milestoneId,
      signerPubkey: signerPk.toBase58(),
      createdAtUnix: nowUnix,
    });

    if (withinCutoff && record.tokenMint) {
      await upsertRewardVoterSnapshot({
        commitmentId: id,
        milestoneId,
        signerPubkey: signerPk.toBase58(),
        createdAtUnix: nowUnix,
        projectMint: record.tokenMint,
        projectUiAmount,
        shipUiAmount,
        shipMultiplierBps,
      });
    }

    const approvalCounts = await getRewardMilestoneApprovalCounts(id);
    const approvalThreshold = getRewardApprovalThreshold();

    const normalized = normalizeRewardMilestonesClaimable({
      milestones,
      nowUnix,
      approvalCounts,
      approvalThreshold,
    });

    const updated = normalized.changed
      ? await updateRewardTotalsAndMilestones({
          id,
          milestones: normalized.milestones,
        })
      : record;

    return NextResponse.json({
      ok: true,
      inserted,
      nowUnix,
      approvalCounts,
      approvalThreshold,
      commitment: publicView(updated),
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

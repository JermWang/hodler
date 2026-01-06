import { NextResponse } from "next/server";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

import { checkRateLimit } from "../../../../../../../lib/rateLimit";
import {
  getVoteRewardAllocation,
  getVoteRewardDistribution,
  setVoteRewardDistributionClaimTxSig,
  tryAcquireVoteRewardDistributionClaim,
} from "../../../../../../../lib/escrowStore";
import {
  getChainUnixTime,
  getConnection,
  keypairFromBase58Secret,
  transferSplTokensFromKeypair,
  transferSplTokensFromPrivyWallet,
} from "../../../../../../../lib/solana";
import { auditLog } from "../../../../../../../lib/auditLog";
import { getSafeErrorMessage } from "../../../../../../../lib/safeError";

export const runtime = "nodejs";

function isVoteRewardPayoutsEnabled(): boolean {
  const raw = String(process.env.CTS_ENABLE_VOTE_REWARD_PAYOUTS ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function expectedClaimMessage(input: {
  commitmentId: string;
  milestoneId: string;
  walletPubkey: string;
  timestampUnix: number;
}): string {
  return `Commit To Ship\nVote Reward Claim\nCommitment: ${input.commitmentId}\nMilestone: ${input.milestoneId}\nWallet: ${input.walletPubkey}\nTimestamp: ${input.timestampUnix}`;
}

function isFreshEnough(nowUnix: number, timestampUnix: number): boolean {
  const skew = Math.abs(nowUnix - timestampUnix);
  return skew <= 5 * 60;
}

function getFaucetSigner(input: { faucetOwnerPubkey: PublicKey }): { kind: "privy"; walletId: string; owner: PublicKey } | { kind: "keypair"; keypair: Keypair } {
  const privyWalletId = String(process.env.CTS_VOTE_REWARD_FAUCET_PRIVY_WALLET_ID ?? "").trim();
  if (privyWalletId) {
    return { kind: "privy", walletId: privyWalletId, owner: input.faucetOwnerPubkey };
  }

  const secret = String(process.env.CTS_VOTE_REWARD_FAUCET_OWNER_SECRET_KEY ?? "").trim();
  if (!secret) {
    throw new Error("CTS_VOTE_REWARD_FAUCET_OWNER_SECRET_KEY (or CTS_VOTE_REWARD_FAUCET_PRIVY_WALLET_ID) is required");
  }

  const kp = keypairFromBase58Secret(secret);
  if (!kp.publicKey.equals(input.faucetOwnerPubkey)) {
    throw new Error("Faucet owner secret key does not match CTS_VOTE_REWARD_FAUCET_OWNER_PUBKEY");
  }

  return { kind: "keypair", keypair: kp };
}

export async function POST(req: Request, ctx: { params: { id: string; milestoneId: string } }) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "vote-reward:claim", limit: 20, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    if (!isVoteRewardPayoutsEnabled()) {
      return NextResponse.json(
        {
          error: "Vote reward payouts are disabled",
          hint: "Set CTS_ENABLE_VOTE_REWARD_PAYOUTS=1 (or true) to enable vote reward claims.",
        },
        { status: 503 }
      );
    }

    const commitmentId = ctx.params.id;
    const milestoneId = ctx.params.milestoneId;

    const body = (await req.json().catch(() => null)) as any;

    const walletPubkey = typeof body?.walletPubkey === "string" ? body.walletPubkey.trim() : "";
    const timestampUnix = Number(body?.timestampUnix);
    const signatureB58 = typeof body?.signatureB58 === "string" ? body.signatureB58.trim() : "";

    if (!walletPubkey) return NextResponse.json({ error: "walletPubkey required" }, { status: 400 });
    if (!Number.isFinite(timestampUnix) || timestampUnix <= 0) return NextResponse.json({ error: "timestampUnix required" }, { status: 400 });
    if (!signatureB58) return NextResponse.json({ error: "signatureB58 required" }, { status: 400 });

    const connection = getConnection();
    const nowUnix = await getChainUnixTime(connection);
    if (!isFreshEnough(nowUnix, timestampUnix)) {
      return NextResponse.json({ error: "Signature timestamp is too old" }, { status: 400 });
    }

    const pk = new PublicKey(walletPubkey);
    const sigBytes = bs58.decode(signatureB58);
    const message = expectedClaimMessage({ commitmentId, milestoneId, walletPubkey, timestampUnix });

    const ok = nacl.sign.detached.verify(new TextEncoder().encode(message), sigBytes, pk.toBytes());
    if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

    const distribution = await getVoteRewardDistribution({ commitmentId, milestoneId });
    if (!distribution) return NextResponse.json({ error: "No vote reward distribution found" }, { status: 404 });

    const alloc = await getVoteRewardAllocation({ distributionId: distribution.id, walletPubkey });
    if (!alloc) return NextResponse.json({ error: "Not eligible for this distribution" }, { status: 403 });

    const amountRawStr = String(alloc.amountRaw ?? "0");
    let amountRaw = 0n;
    try {
      amountRaw = BigInt(amountRawStr);
    } catch {
      amountRaw = 0n;
    }
    if (amountRaw <= 0n) {
      return NextResponse.json({ error: "No claimable amount" }, { status: 400 });
    }

    const faucetOwner = new PublicKey(distribution.faucetOwnerPubkey);
    const signer = getFaucetSigner({ faucetOwnerPubkey: faucetOwner });

    const claimed = await tryAcquireVoteRewardDistributionClaim({
      distributionId: distribution.id,
      walletPubkey,
      claimedAtUnix: nowUnix,
      amountRaw: amountRaw.toString(),
    });

    if (!claimed.acquired) {
      const existing = claimed.existing;
      if (String(existing.amountRaw) !== amountRaw.toString()) {
        return NextResponse.json(
          { error: "Existing claim has mismatched amount", existing, expectedAmountRaw: amountRaw.toString() },
          { status: 409 }
        );
      }

      if (existing.txSig) {
        return NextResponse.json({
          ok: true,
          idempotent: true,
          nowUnix,
          signature: existing.txSig,
          amountRaw: amountRaw.toString(),
          distributionId: distribution.id,
        });
      }

      return NextResponse.json({ error: "Already claimed" }, { status: 409 });
    }

    const mint = new PublicKey(distribution.mintPubkey);
    const tokenProgram = new PublicKey(distribution.tokenProgramPubkey);

    const sent =
      signer.kind === "privy"
        ? await transferSplTokensFromPrivyWallet({
            connection,
            mint,
            walletId: signer.walletId,
            fromOwner: signer.owner,
            toOwner: pk,
            amountRaw,
            tokenProgram,
          })
        : await transferSplTokensFromKeypair({
            connection,
            mint,
            from: signer.keypair,
            toOwner: pk,
            amountRaw,
            tokenProgram,
          });

    await setVoteRewardDistributionClaimTxSig({ distributionId: distribution.id, walletPubkey, txSig: sent.signature });

    await auditLog("vote_reward_claim_ok", {
      commitmentId,
      milestoneId,
      distributionId: distribution.id,
      walletPubkey,
      amountRaw: amountRaw.toString(),
      txSig: sent.signature,
    });

    return NextResponse.json({ ok: true, nowUnix, signature: sent.signature, amountRaw: amountRaw.toString(), distributionId: distribution.id });
  } catch (e) {
    await auditLog("vote_reward_claim_error", {
      commitmentId: ctx.params.id,
      milestoneId: ctx.params.milestoneId,
      error: getSafeErrorMessage(e),
    });
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

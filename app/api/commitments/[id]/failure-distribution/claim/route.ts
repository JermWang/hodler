import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

import {
  getCommitment,
  getEscrowSignerRef,
  getFailureAllocation,
  getFailureDistributionByCommitmentId,
  hasFailureClaim,
  insertFailureClaim,
} from "../../../../../lib/escrowStore";
import { checkRateLimit } from "../../../../../lib/rateLimit";
import {
  getChainUnixTime,
  getConnection,
  keypairFromBase58Secret,
  transferLamports,
  transferLamportsFromPrivyWallet,
} from "../../../../../lib/solana";
import { getSafeErrorMessage } from "../../../../../lib/safeError";

export const runtime = "nodejs";

function expectedClaimMessage(input: { commitmentId: string; walletPubkey: string; timestampUnix: number }): string {
  return `Commit To Ship\nFailure Voter Claim\nCommitment: ${input.commitmentId}\nWallet: ${input.walletPubkey}\nTimestamp: ${input.timestampUnix}`;
}

function isFreshEnough(nowUnix: number, timestampUnix: number): boolean {
  const skew = Math.abs(nowUnix - timestampUnix);
  return skew <= 5 * 60;
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const rl = checkRateLimit(req, { keyPrefix: "failure:claim", limit: 20, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const commitmentId = ctx.params.id;
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
    const message = expectedClaimMessage({ commitmentId, walletPubkey, timestampUnix });

    const ok = nacl.sign.detached.verify(new TextEncoder().encode(message), sigBytes, pk.toBytes());
    if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

    const distribution = await getFailureDistributionByCommitmentId(commitmentId);
    if (!distribution) return NextResponse.json({ error: "No failure distribution found" }, { status: 404 });

    const alreadyClaimed = await hasFailureClaim({ distributionId: distribution.id, walletPubkey });
    if (alreadyClaimed) return NextResponse.json({ error: "Already claimed" }, { status: 409 });

    const alloc = await getFailureAllocation({ distributionId: distribution.id, walletPubkey });
    if (!alloc) return NextResponse.json({ error: "Not eligible for this distribution" }, { status: 403 });

    const amountLamports = Number(alloc.amountLamports);
    if (!Number.isFinite(amountLamports) || amountLamports <= 0) {
      return NextResponse.json({ error: "No claimable amount" }, { status: 400 });
    }

    const commitment = await getCommitment(commitmentId);
    if (!commitment) return NextResponse.json({ error: "Commitment not found" }, { status: 404 });

    const escrowRef = getEscrowSignerRef(commitment);
    const fromPubkey = new PublicKey(commitment.escrowPubkey);

    const { signature } =
      escrowRef.kind === "privy"
        ? await transferLamportsFromPrivyWallet({ connection, walletId: escrowRef.walletId, fromPubkey, to: pk, lamports: amountLamports })
        : await transferLamports({ connection, from: keypairFromBase58Secret(escrowRef.escrowSecretKeyB58), to: pk, lamports: amountLamports });

    await insertFailureClaim({
      distributionId: distribution.id,
      walletPubkey,
      claimedAtUnix: nowUnix,
      amountLamports,
      txSig: signature,
    });

    return NextResponse.json({ ok: true, nowUnix, signature, amountLamports, distributionId: distribution.id });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

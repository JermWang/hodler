import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

import { auditLog } from "./auditLog";
import { getClaimableCreatorFeeLamports, buildCollectCreatorFeeInstruction } from "./pumpfun";
import { releasePumpfunCreatorFeeClaimLock, tryAcquirePumpfunCreatorFeeClaimLock } from "./pumpfunClaimLock";
import { privySignAndSendSolanaTransaction } from "./privy";
import { getConnection, confirmTransactionSignature } from "./solana";
import { getCommitment, getEscrowSignerRef, listCommitments, updateRewardTotalsAndMilestones } from "./escrowStore";

const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"; // mainnet

const CREATOR_FEE_SWEEP_KEEP_LAMPORTS = (() => {
  const raw = Number(process.env.CTS_CREATOR_FEE_SWEEP_KEEP_LAMPORTS ?? "");
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 25_000;
})();

export async function sweepManagedCreatorFeesToEscrow(input: { commitmentId: string; actor?: { kind: "cron" | "admin" | "creator"; walletPubkey?: string } }): Promise<any> {
  const commitmentId = String(input.commitmentId ?? "").trim();
  if (!commitmentId) return { id: commitmentId, ok: false, error: "commitmentId required" };

  const record = await getCommitment(commitmentId);
  if (!record) return { id: commitmentId, ok: false, error: "Commitment not found" };

  if (record.kind !== "creator_reward") return { id: commitmentId, ok: false, error: "Not a creator reward commitment" };
  if (record.creatorFeeMode !== "managed") return { id: commitmentId, ok: false, error: "Commitment is not in managed mode" };
  if (record.status === "archived") return { id: commitmentId, ok: false, status: 404, error: "Commitment not found" };

  const all = await listCommitments();
  const shared = all.filter((c) => c.kind === "creator_reward" && c.creatorFeeMode === "managed" && c.status !== "archived" && c.authority === record.authority);
  if (shared.length > 1) {
    return {
      id: commitmentId,
      ok: false,
      status: 409,
      error: "Creator wallet is shared across multiple commitments; sweep is blocked to prevent mixing creator fees",
      creatorPubkey: record.authority,
      sharedCommitmentIds: shared.map((c) => c.id),
    };
  }

  const signerRef = getEscrowSignerRef(record);
  if (signerRef.kind !== "privy") return { id: commitmentId, ok: false, error: "Commitment does not use a Privy-managed wallet" };

  const privyWalletId = signerRef.walletId;
  const connection = getConnection();

  const creatorWallet = new PublicKey(record.authority);
  const escrowPubkey = new PublicKey(record.escrowPubkey);

  const lock = await tryAcquirePumpfunCreatorFeeClaimLock({ creatorPubkey: creatorWallet.toBase58(), maxAgeSeconds: 5 * 60 });
  if (!lock.acquired) {
    return { id: commitmentId, ok: false, status: 409, error: "Sweep already in progress", existing: lock.existing };
  }

  try {
    const { claimableLamports, creatorVault } = await getClaimableCreatorFeeLamports({ connection, creator: creatorWallet });
    if (claimableLamports <= 0) {
      await releasePumpfunCreatorFeeClaimLock({ creatorPubkey: creatorWallet.toBase58() });
      return { id: commitmentId, ok: true, swept: false, claimableLamports: 0, creatorVault: creatorVault.toBase58(), escrowPubkey: escrowPubkey.toBase58() };
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("processed");
    const { ix: claimIx } = buildCollectCreatorFeeInstruction({ creator: creatorWallet });

    const sameWallet = creatorWallet.toBase58() === escrowPubkey.toBase58();
    const transferAmount = sameWallet ? 0 : Math.max(0, claimableLamports - CREATOR_FEE_SWEEP_KEEP_LAMPORTS);

    const tx = new Transaction();
    tx.feePayer = creatorWallet;
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.add(claimIx);
    if (!sameWallet && transferAmount > 0) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: creatorWallet,
          toPubkey: escrowPubkey,
          lamports: transferAmount,
        })
      );
    }

    const txBase64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
    const { signature } = await privySignAndSendSolanaTransaction({ walletId: privyWalletId, caip2: SOLANA_CAIP2, transactionBase64: txBase64 });

    await confirmTransactionSignature({ connection, signature, blockhash, lastValidBlockHeight });

    const delta = sameWallet ? claimableLamports : transferAmount;
    const newTotalFunded = (record.totalFundedLamports ?? 0) + delta;
    await updateRewardTotalsAndMilestones({ id: commitmentId, totalFundedLamports: newTotalFunded });

    await releasePumpfunCreatorFeeClaimLock({ creatorPubkey: creatorWallet.toBase58() });

    await auditLog("escrow_sweep_ok", {
      commitmentId,
      actor: input.actor?.kind ?? "unknown",
      actorWalletPubkey: input.actor?.walletPubkey ?? null,
      signature,
      claimedLamports: claimableLamports,
      transferredLamports: transferAmount,
      escrowPubkey: escrowPubkey.toBase58(),
      creatorVault: creatorVault.toBase58(),
    });

    return {
      id: commitmentId,
      ok: true,
      swept: true,
      claimedLamports: claimableLamports,
      transferredLamports: transferAmount,
      newTotalFundedLamports: newTotalFunded,
      signature,
      creatorVault: creatorVault.toBase58(),
      escrowPubkey: escrowPubkey.toBase58(),
    };
  } catch (e) {
    await releasePumpfunCreatorFeeClaimLock({ creatorPubkey: creatorWallet.toBase58() });
    throw e;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { hasDatabase, getPool } from "@/app/lib/db";
import { getConnection } from "@/app/lib/solana";
import { getBondingCurveCreator, getClaimableCreatorFeeLamports, getCreatorVaultPda } from "@/app/lib/pumpfun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/fee-trace?tokenMint=...
 * 
 * Diagnostic endpoint to trace all creator fee movements for a token.
 * Returns all audit logs related to fee sweeps, claims, and payouts.
 */
export async function GET(req: NextRequest) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const url = new URL(req.url);
    const tokenMint = url.searchParams.get("tokenMint")?.trim() || "";
    const creatorWallet = url.searchParams.get("creatorWallet")?.trim() || "";

    if (!tokenMint && !creatorWallet) {
      return NextResponse.json({ error: "tokenMint or creatorWallet required" }, { status: 400 });
    }

    const pool = getPool();

    // Get commitment info
    const commitmentRes = await pool.query(
      `SELECT id, authority, escrow_pubkey, creator_pubkey, token_mint, creator_fee_mode, status, total_funded_lamports, unlocked_lamports, created_at_unix
       FROM public.commitments
       WHERE token_mint = $1 OR authority = $2 OR creator_pubkey = $2
       ORDER BY created_at_unix DESC`,
      [tokenMint || "", creatorWallet || tokenMint]
    );

    // Get campaign info
    const campaignRes = await pool.query(
      `SELECT id, token_mint, project_pubkey, escrow_wallet_pubkey, reward_pool_lamports, platform_fee_lamports, total_fee_lamports, status, created_at_unix
       FROM public.campaigns
       WHERE token_mint = $1 OR project_pubkey = $2
       ORDER BY created_at_unix DESC`,
      [tokenMint || "", creatorWallet || tokenMint]
    );

    // Get all fee-related audit logs
    const auditRes = await pool.query(
      `SELECT id, event, ts_unix, fields
       FROM public.audit_logs
       WHERE event IN (
         'pumpfun_fee_sweep_ok',
         'pumpfun_fee_claim_ok', 
         'pumpfun_creator_payout_ok',
         'escrow_sweep_ok',
         'creator_escrow_claim_ok',
         'claim_escrow_funds_ok',
         'admin_drain_commitment_escrow_ok'
       )
       AND (
         fields->>'tokenMint' = $1
         OR fields->>'creatorWallet' = $2
         OR fields->>'creatorWallet' = $1
       )
       ORDER BY ts_unix ASC`,
      [tokenMint || "", creatorWallet || tokenMint]
    );

    // Sum up totals from audit logs
    let totalClaimedFromPumpfun = 0;
    let totalTransferredToEscrow = 0;
    let totalCreatorPayouts = 0;
    let totalHolderShare = 0;
    let totalCreatorShare = 0;

    const auditLogs = auditRes.rows.map((row: any) => {
      const fields = row.fields || {};
      const event = row.event;

      // Sum based on event type
      if (event === "pumpfun_fee_sweep_ok" || event === "pumpfun_fee_claim_ok") {
        totalClaimedFromPumpfun += Number(fields.claimedLamports || 0);
        totalTransferredToEscrow += Number(fields.transferredLamports || 0);
        totalHolderShare += Number(fields.holderShareLamports || fields.transferredLamports || 0);
        totalCreatorShare += Number(fields.creatorShareLamports || 0);
      }
      if (event === "pumpfun_creator_payout_ok") {
        totalCreatorPayouts += Number(fields.creatorPayoutLamports || 0);
      }
      if (event === "escrow_sweep_ok") {
        totalClaimedFromPumpfun += Number(fields.claimedLamports || 0);
        totalTransferredToEscrow += Number(fields.transferredLamports || 0);
      }

      return {
        id: row.id,
        event: row.event,
        tsUnix: row.ts_unix,
        date: new Date(Number(row.ts_unix) * 1000).toISOString(),
        fields,
      };
    });

    // Get campaign escrow wallet info if available
    const campaignEscrowRes = campaignRes.rows.length > 0
      ? await pool.query(
          `SELECT id, campaign_id, wallet_pubkey, privy_wallet_id, created_at_unix
           FROM public.campaign_escrow_wallets
           WHERE campaign_id = $1`,
          [campaignRes.rows[0]?.id || ""]
        )
      : { rows: [] };

    // Calculate summary
    const summary = {
      totalClaimedFromPumpfunLamports: totalClaimedFromPumpfun,
      totalClaimedFromPumpfunSol: totalClaimedFromPumpfun / 1e9,
      totalTransferredToEscrowLamports: totalTransferredToEscrow,
      totalTransferredToEscrowSol: totalTransferredToEscrow / 1e9,
      totalCreatorPayoutsLamports: totalCreatorPayouts,
      totalCreatorPayoutsSol: totalCreatorPayouts / 1e9,
      totalHolderShareLamports: totalHolderShare,
      totalHolderShareSol: totalHolderShare / 1e9,
      totalCreatorShareLamports: totalCreatorShare,
      totalCreatorShareSol: totalCreatorShare / 1e9,
      // Discrepancy: claimed - (transferred + creator payouts)
      unaccountedLamports: totalClaimedFromPumpfun - totalTransferredToEscrow - totalCreatorPayouts,
      unaccountedSol: (totalClaimedFromPumpfun - totalTransferredToEscrow - totalCreatorPayouts) / 1e9,
    };

    // Get all unique wallets involved
    const wallets = new Set<string>();
    for (const log of auditLogs) {
      if (log.fields.creatorWallet) wallets.add(log.fields.creatorWallet);
      if (log.fields.escrowWallet) wallets.add(log.fields.escrowWallet);
      if (log.fields.escrowPubkey) wallets.add(log.fields.escrowPubkey);
      if (log.fields.projectWallet) wallets.add(log.fields.projectWallet);
      if (log.fields.creatorVault) wallets.add(log.fields.creatorVault);
    }
    for (const c of commitmentRes.rows) {
      if (c.authority) wallets.add(c.authority);
      if (c.escrow_pubkey) wallets.add(c.escrow_pubkey);
      if (c.creator_pubkey) wallets.add(c.creator_pubkey);
    }
    for (const c of campaignRes.rows) {
      if (c.project_pubkey) wallets.add(c.project_pubkey);
      if (c.escrow_wallet_pubkey) wallets.add(c.escrow_wallet_pubkey);
    }

    // Query on-chain data if tokenMint provided
    let onChainData: any = null;
    if (tokenMint) {
      try {
        const connection = getConnection();
        const mintPk = new PublicKey(tokenMint);
        const creatorPk = await getBondingCurveCreator({ connection, mint: mintPk });
        const creatorVaultPda = getCreatorVaultPda(creatorPk);
        const claimable = await getClaimableCreatorFeeLamports({ connection, creator: creatorPk });
        
        // Get transaction signatures for the creator vault to trace all withdrawals
        const signatures = await connection.getSignaturesForAddress(creatorVaultPda, { limit: 100 }, "confirmed");
        
        // Calculate total withdrawn by parsing transaction history
        let totalWithdrawnFromVaultLamports = 0;
        const vaultTransactions: any[] = [];
        
        for (const sig of signatures.slice(0, 20)) { // Limit to 20 for performance
          try {
            const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
            if (!tx?.meta) continue;
            
            const preBalances = tx.meta.preBalances || [];
            const postBalances = tx.meta.postBalances || [];
            const accountKeys = tx.transaction.message.accountKeys.map((k: any) => k.pubkey?.toBase58?.() || k.toString());
            
            const vaultIndex = accountKeys.findIndex((k: string) => k === creatorVaultPda.toBase58());
            if (vaultIndex >= 0) {
              const preBal = preBalances[vaultIndex] || 0;
              const postBal = postBalances[vaultIndex] || 0;
              const delta = preBal - postBal;
              if (delta > 0) {
                totalWithdrawnFromVaultLamports += delta;
                vaultTransactions.push({
                  signature: sig.signature,
                  blockTime: sig.blockTime,
                  date: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : null,
                  withdrawnLamports: delta,
                  withdrawnSol: delta / 1e9,
                });
              }
            }
          } catch {
            // Skip failed transaction parsing
          }
        }
        
        onChainData = {
          bondingCurveCreator: creatorPk.toBase58(),
          creatorVaultPda: creatorVaultPda.toBase58(),
          currentVaultBalanceLamports: claimable.vaultBalanceLamports,
          currentVaultBalanceSol: claimable.vaultBalanceLamports / 1e9,
          currentClaimableLamports: claimable.claimableLamports,
          currentClaimableSol: claimable.claimableLamports / 1e9,
          rentExemptMinLamports: claimable.rentExemptMinLamports,
          totalSignaturesFound: signatures.length,
          totalWithdrawnFromVaultLamports,
          totalWithdrawnFromVaultSol: totalWithdrawnFromVaultLamports / 1e9,
          // True all-time fees = withdrawn + currently claimable
          trueAllTimeFeesLamports: totalWithdrawnFromVaultLamports + claimable.claimableLamports,
          trueAllTimeFeesSol: (totalWithdrawnFromVaultLamports + claimable.claimableLamports) / 1e9,
          vaultTransactions,
          note: signatures.length >= 100 ? "More than 100 transactions found, totals may be incomplete" : undefined,
        };
        
        wallets.add(creatorPk.toBase58());
        wallets.add(creatorVaultPda.toBase58());
      } catch (e) {
        onChainData = { error: e instanceof Error ? e.message : "Failed to query on-chain data" };
      }
    }

    return NextResponse.json({
      ok: true,
      tokenMint,
      creatorWallet,
      commitments: commitmentRes.rows.map((r: any) => ({
        id: r.id,
        authority: r.authority,
        escrowPubkey: r.escrow_pubkey,
        creatorPubkey: r.creator_pubkey,
        tokenMint: r.token_mint,
        creatorFeeMode: r.creator_fee_mode,
        status: r.status,
        totalFundedLamports: r.total_funded_lamports,
        totalFundedSol: Number(r.total_funded_lamports || 0) / 1e9,
        unlockedLamports: r.unlocked_lamports,
        createdAtUnix: r.created_at_unix,
      })),
      campaigns: campaignRes.rows.map((r: any) => ({
        id: r.id,
        tokenMint: r.token_mint,
        projectPubkey: r.project_pubkey,
        escrowWalletPubkey: r.escrow_wallet_pubkey,
        rewardPoolLamports: r.reward_pool_lamports,
        rewardPoolSol: Number(r.reward_pool_lamports || 0) / 1e9,
        platformFeeLamports: r.platform_fee_lamports,
        platformFeeSol: Number(r.platform_fee_lamports || 0) / 1e9,
        totalFeeLamports: r.total_fee_lamports,
        totalFeeSol: Number(r.total_fee_lamports || 0) / 1e9,
        status: r.status,
        createdAtUnix: r.created_at_unix,
      })),
      campaignEscrowWallets: campaignEscrowRes.rows.map((r: any) => ({
        id: r.id,
        campaignId: r.campaign_id,
        walletPubkey: r.wallet_pubkey,
        privyWalletId: r.privy_wallet_id,
        createdAtUnix: r.created_at_unix,
      })),
      auditLogs,
      auditLogCount: auditLogs.length,
      summary,
      onChainData,
      walletsInvolved: Array.from(wallets),
      discrepancyAnalysis: onChainData && !onChainData.error ? {
        onChainTotalFeesLamports: onChainData.trueAllTimeFeesLamports,
        onChainTotalFeesSol: onChainData.trueAllTimeFeesSol,
        auditLogTotalClaimedLamports: totalClaimedFromPumpfun,
        auditLogTotalClaimedSol: totalClaimedFromPumpfun / 1e9,
        missingFromAuditLogsLamports: Math.max(0, onChainData.trueAllTimeFeesLamports - totalClaimedFromPumpfun),
        missingFromAuditLogsSol: Math.max(0, (onChainData.trueAllTimeFeesLamports - totalClaimedFromPumpfun) / 1e9),
        explanation: onChainData.trueAllTimeFeesLamports > totalClaimedFromPumpfun 
          ? "Fees were claimed from Pump.fun before audit logging was set up. The missing amount represents early claims not tracked in audit_logs."
          : "Audit logs appear to match on-chain data.",
      } : null,
    });
  } catch (error) {
    console.error("[fee-trace] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

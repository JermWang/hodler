"use client";

import { ReactNode, useMemo } from "react";
import { clusterApiUrl } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";

export default function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => {
    const explicit = String(process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "").trim();
    if (explicit.length) return explicit;

    const cluster = String(process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "mainnet-beta").trim();
    if (cluster === "devnet" || cluster === "testnet" || cluster === "mainnet-beta") {
      return clusterApiUrl(cluster);
    }

    return clusterApiUrl("mainnet-beta");
  }, []);

  const wallets = useMemo(() => {
    return [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new BackpackWalletAdapter()];
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

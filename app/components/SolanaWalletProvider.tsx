"use client";

import { ReactNode, useCallback, useMemo } from "react";
import { clusterApiUrl } from "@solana/web3.js";
import { Buffer } from "buffer";
import { WalletAdapterNetwork, WalletError } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";

let lastWalletErrorAt = 0;

if (typeof globalThis !== "undefined") {
  const g: any = globalThis as any;
  if (!g.global) g.global = globalThis;
  if (!g.Buffer) g.Buffer = Buffer;
}

export default function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const network = useMemo<WalletAdapterNetwork>(() => {
    const raw = String(process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "mainnet-beta").trim();
    if (raw === "devnet") return WalletAdapterNetwork.Devnet;
    if (raw === "testnet") return WalletAdapterNetwork.Testnet;
    return WalletAdapterNetwork.Mainnet;
  }, []);

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
    return [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network }), new BackpackWalletAdapter()];
  }, [network]);

  const onError = useCallback((error: WalletError) => {
    const now = Date.now();
    if (now - lastWalletErrorAt < 4000) return;
    lastWalletErrorAt = now;

    const anyErr: any = error as any;
    console.warn("[wallet] error", {
      name: String(anyErr?.name ?? ""),
      message: String(anyErr?.message ?? ""),
    });
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false} onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

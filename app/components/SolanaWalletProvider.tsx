"use client";

import { ReactNode, useCallback, useMemo, useState, useEffect } from "react";
import { clusterApiUrl } from "@solana/web3.js";
import { Buffer } from "buffer";
import { WalletAdapterNetwork, WalletError, WalletReadyState } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";

if (typeof globalThis !== "undefined") {
  const g: any = globalThis as any;
  if (!g.global) g.global = globalThis;
  if (!g.Buffer) g.Buffer = Buffer;
}

export default function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    return [new SolflareWalletAdapter({ network }), new BackpackWalletAdapter()];
  }, [network]);

  const onError = useCallback((error: WalletError) => {
    const anyErr: any = error as any;
    const details = {
      name: String((error as any)?.name ?? ""),
      message: String((error as any)?.message ?? ""),
      causeName: String(anyErr?.cause?.name ?? ""),
      causeMessage: String(anyErr?.cause?.message ?? ""),
      innerName: String(anyErr?.error?.name ?? ""),
      innerMessage: String(anyErr?.error?.message ?? ""),
      code: anyErr?.code,
      causeCode: anyErr?.cause?.code,
    };

    console.error("[wallet] error", JSON.stringify(details), details);
    if (anyErr?.cause != null) console.error("[wallet] cause", anyErr.cause);
    if (anyErr?.error != null) console.error("[wallet] inner", anyErr.error);
    console.error("[wallet] raw", error);
  }, []);

  const autoConnect = useCallback(async (adapter: any) => {
    try {
      const readyState: WalletReadyState | undefined = adapter?.readyState;
      if (readyState !== WalletReadyState.Installed && readyState !== WalletReadyState.Loadable) {
        return false;
      }

      if (typeof adapter?.autoConnect === "function") {
        await adapter.autoConnect();
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={mounted ? wallets : []} autoConnect={mounted ? autoConnect : false} onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

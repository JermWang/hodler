import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Suspense } from "react";
import Link from "next/link";
import TokenContractBar from "./components/TokenContractBar";
import GlobalNavLinks from "./components/GlobalNavLinks";
import AsciiWaves from "./components/AsciiWaves";
import AsciiParticles from "./components/AsciiParticles";
import SolanaWalletProvider from "./components/SolanaWalletProvider";
import { ToastProvider } from "./components/ToastProvider";

export const metadata = {
  title: "Commit To Ship",
  description:
    "Lock your pump.fun creator fees in on-chain escrow. Set milestones; holders vote to approve releases. Miss a deadline? Fees get redistributed to voters and fuel $SHIP buybacks.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "Commit To Ship",
    description:
      "Lock your pump.fun creator fees in on-chain escrow. Set milestones; holders vote to approve releases. Miss a deadline? Fees get redistributed to voters and fuel $SHIP buybacks.",
    images: [
      {
        url: "/branding/COMMIT-TO-SHIP-PROMO-1.png",
        width: 1024,
        height: 576,
        alt: "Commit To Ship — Accountability infrastructure & milestone escrow",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Commit To Ship",
    description:
      "Lock your pump.fun creator fees in on-chain escrow. Set milestones; holders vote to approve releases. Miss a deadline? Fees get redistributed to voters and fuel $SHIP buybacks.",
    images: ["/branding/COMMIT-TO-SHIP-PROMO-1.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body data-skin="app">
        <AsciiParticles />
        <Suspense fallback={null}>
          <AsciiWaves />
        </Suspense>
        <SolanaWalletProvider>
          <ToastProvider>
            <header className="globalNav">
              <div className="globalNavInner">
                <div className="globalNavLeft">
                  <Link className="globalNavBrand" href="/">
                    <span className="globalNavBrandMarkWrap">
                      <img className="globalNavBrandMark" src="/branding/white-logo.png" alt="Commit To Ship" />
                    </span>
                    <span className="globalNavBrandText">Commit To Ship</span>
                  </Link>

                  <TokenContractBar />
                </div>

                <Suspense fallback={null}>
                  <GlobalNavLinks />
                </Suspense>
              </div>
            </header>

            {children}
          </ToastProvider>
        </SolanaWalletProvider>
      </body>
    </html>
  );
}

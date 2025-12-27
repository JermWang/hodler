import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Suspense } from "react";
import Link from "next/link";
import TokenContractBar from "./components/TokenContractBar";
import GlobalNavLinks from "./components/GlobalNavLinks";
import AsciiWaves from "./components/AsciiWaves";
import SolanaWalletProvider from "./components/SolanaWalletProvider";

export const metadata = {
  title: "Commit To Ship",
  description: "Custodial SOL escrow commitments",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
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
        <SolanaWalletProvider>
          <AsciiWaves />
          <header className="globalNav">
            <div className="globalNavInner">
              <div className="globalNavLeft">
                <Link className="globalNavBrand" href="/">
                  <img className="globalNavBrandMark" src="/branding/svg-logo.svg" alt="Commit To Ship" />
                  <span className="globalNavBrandText">Commit To Ship</span>
                </Link>

                <TokenContractBar />
              </div>

              <Suspense fallback={null}>
                <GlobalNavLinks />
              </Suspense>
            </div>
          </header>

          <Suspense fallback={null}>{children}</Suspense>
        </SolanaWalletProvider>
      </body>
    </html>
  );
}

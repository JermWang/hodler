import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import GlobalNavLinks from "./components/GlobalNavLinks";
import SolanaWalletProvider from "./components/SolanaWalletProvider";
import { ToastProvider } from "./components/ToastProvider";

const AsciiBackground = dynamic(() => import("./components/AsciiBackground"), {
  ssr: false,
});

export const metadata = {
  title: "AmpliFi - Turn Holders Into Your Marketing Engine",
  description:
    "AmpliFi is a creator growth protocol that automatically pays token holders for organic marketing activity, verified by onchain ownership and social engagement.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "AmpliFi - Turn Holders Into Your Marketing Engine",
    description:
      "AmpliFi is a creator growth protocol that automatically pays token holders for organic marketing activity, verified by onchain ownership and social engagement.",
    images: [
      {
        url: "/branding/amplifi/og-image.png",
        width: 1200,
        height: 630,
        alt: "AmpliFi — Creator Growth Protocol",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AmpliFi - Turn Holders Into Your Marketing Engine",
    description:
      "AmpliFi is a creator growth protocol that automatically pays token holders for organic marketing activity, verified by onchain ownership and social engagement.",
    images: ["/branding/amplifi/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="text-white min-h-screen relative bg-transparent">
        <AsciiBackground />
        <div className="relative z-10 bg-transparent">
          <SolanaWalletProvider>
            <ToastProvider>
              <header className="fixed top-0 left-0 right-0 z-50 border-b border-dark-border bg-dark-bg/80 backdrop-blur-xl">
                <div className="mx-auto max-w-[1280px] px-6 h-16 flex items-center justify-between">
                  <div className="flex items-center gap-8">
                    <Link className="flex items-center gap-2" href="/">
                      <img 
                        className="h-8 w-auto" 
                        src="/branding/amplifi/AmpliFi-logo-white-logo.png" 
                        alt="AmpliFi" 
                      />
                      <span className="text-xl font-bold text-white">AmpliFi</span>
                    </Link>

                    <nav className="hidden md:flex items-center gap-6">
                      <Link href="/discover" className="text-sm font-medium text-foreground-secondary hover:text-white transition-colors">
                        Discover
                      </Link>
                      <Link href="/campaigns" className="text-sm font-medium text-foreground-secondary hover:text-white transition-colors">
                        Campaigns
                      </Link>
                      <Link href="/launch" className="text-sm font-medium text-foreground-secondary hover:text-white transition-colors">
                        Launch
                      </Link>
                      <Link href="/holder" className="text-sm font-medium text-foreground-secondary hover:text-white transition-colors">
                        Dashboard
                      </Link>
                    </nav>
                  </div>

                  <Suspense fallback={null}>
                    <GlobalNavLinks />
                  </Suspense>
                </div>
              </header>

              <main className="pt-16">
                {children}
              </main>
            </ToastProvider>
          </SolanaWalletProvider>
        </div>
      </body>
    </html>
  );
}

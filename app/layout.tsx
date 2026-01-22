import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import GlobalNavLinks from "./components/GlobalNavLinks";
import AppNavLinks from "./components/AppNavLinks";
import { ToastProvider } from "./components/ToastProvider";
import { OnboardingProvider } from "./components/OnboardingProvider";
import { Footer } from "./components/landing/Footer";

const AsciiBackground = dynamic(() => import("./components/AsciiBackground"), {
  ssr: false,
});

const SolanaWalletProvider = dynamic(
  () => import("./components/SolanaWalletProvider"),
  { ssr: false }
);

export const metadata = {
  title: "AmpliFi",
  description:
    "50% of creator fees go to holders who post. We score your X engagement and auto-distribute SOL every epoch.",
  icons: {
    icon: [{ url: "/branding/green-n-yellowPFP.png", type: "image/png" }],
  },
  openGraph: {
    title: "AmpliFi",
    description:
      "50% of creator fees go to holders who post. We score your X engagement and auto-distribute SOL every epoch.",
    images: [
      {
        url: "/branding/amplifi/og-image.png",
        width: 1200,
        height: 630,
        alt: "AmpliFi",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AmpliFi",
    description:
      "50% of creator fees go to holders who post. We score your X engagement and auto-distribute SOL every epoch.",
    images: ["/branding/amplifi/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="text-white min-h-screen relative bg-transparent" suppressHydrationWarning>
        <AsciiBackground />
        <div className="relative z-10 bg-transparent">
          <SolanaWalletProvider>
            <ToastProvider>
              <OnboardingProvider>
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

                    <AppNavLinks />
                  </div>

                  <Suspense fallback={null}>
                    <GlobalNavLinks />
                  </Suspense>
                </div>
              </header>

              <main className="pt-16 min-h-screen">
                {children}
              </main>
              <Footer />
              </OnboardingProvider>
            </ToastProvider>
          </SolanaWalletProvider>
        </div>
      </body>
    </html>
  );
}

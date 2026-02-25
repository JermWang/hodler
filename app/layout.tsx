import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import dynamic from "next/dynamic";
import { ToastProvider } from "./components/ToastProvider";

const SolanaWalletProvider = dynamic(
  () => import("./components/SolanaWalletProvider"),
  { ssr: false }
);

function resolveMetadataBase(): URL {
  const raw = String(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "").trim();
  try {
    return new URL(raw || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata = {
  metadataBase: resolveMetadataBase(),
  title: "HODLR",
  description:
    "Holder rewards for diamond hands. Track your holding duration and claim SOL rewards every epoch.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "HODLR",
    description:
      "Holder rewards for diamond hands. Track your holding duration and claim SOL rewards every epoch.",
    images: [
      {
        url: "/banner.png",
        width: 1200,
        height: 630,
        alt: "HODLR",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HODLR",
    description:
      "Holder rewards for diamond hands. Track your holding duration and claim SOL rewards every epoch.",
    images: ["/banner.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="text-white min-h-screen bg-[#0e0e10]" suppressHydrationWarning>
        <SolanaWalletProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </SolanaWalletProvider>
      </body>
    </html>
  );
}

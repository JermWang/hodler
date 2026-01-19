import "@/app/globals.css";

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
        alt: "AmpliFi - Creator Growth Protocol",
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

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

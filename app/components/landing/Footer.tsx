"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative py-16 bg-black overflow-hidden">
      {/* ASCII Pattern Background */}
      <div className="absolute inset-0 opacity-5 overflow-hidden">
        <AsciiPattern />
      </div>

      <div className="relative mx-auto max-w-layout px-6">
        <div className="grid md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amplifi-blue">
                <span className="text-lg font-bold text-white">A</span>
              </div>
              <span className="text-xl font-bold text-white">AmpliFi</span>
            </Link>
            <p className="text-sm text-white/60">
              Turn holders into your marketing engine.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/app" className="text-sm text-white/60 hover:text-white transition-colors">
                  Launch App
                </Link>
              </li>
              <li>
                <Link href="/campaigns" className="text-sm text-white/60 hover:text-white transition-colors">
                  Explore Campaigns
                </Link>
              </li>
              <li>
                <Link href="/rewards" className="text-sm text-white/60 hover:text-white transition-colors">
                  Claim Rewards
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Resources</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/docs" className="text-sm text-white/60 hover:text-white transition-colors">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="/transparency" className="text-sm text-white/60 hover:text-white transition-colors">
                  Transparency
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-sm text-white/60 hover:text-white transition-colors">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Community</h4>
            <ul className="space-y-3">
              <li>
                <a
                  href="https://x.com/AmpliFi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  Twitter/X
                </a>
              </li>
              <li>
                <a
                  href="https://discord.gg/amplifi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  Discord
                </a>
              </li>
              <li>
                <a
                  href="https://t.me/amplifi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  Telegram
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-white/40">
            © {new Date().getFullYear()} AmpliFi. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link href="/terms" className="text-sm text-white/40 hover:text-white/60 transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="text-sm text-white/40 hover:text-white/60 transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function AsciiPattern() {
  const rows = 20;
  const cols = 80;
  const chars = ["0", "1", "·", "■", "□", "▪", "▫"];
  
  let pattern = "";
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      pattern += chars[Math.floor(Math.random() * chars.length)] + " ";
    }
    pattern += "\n";
  }

  return (
    <pre className="text-amplifi-blue font-mono text-xs leading-relaxed whitespace-pre select-none">
      {pattern}
    </pre>
  );
}

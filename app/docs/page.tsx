import Link from "next/link";
import { 
  BookOpen, Zap, Coins, Shield, 
  Wallet, TrendingUp, Gift, Clock, 
  ArrowRight, Trophy, Timer, Users
} from "lucide-react";
import { HodlrLayout } from "@/app/components/hodlr";

const TOC_ITEMS = [
  { id: "overview", label: "What is HODLR?" },
  { id: "how-it-works", label: "How It Works" },
  { id: "eligibility", label: "Eligibility" },
  { id: "epochs", label: "Epochs & Distributions" },
  { id: "claiming", label: "Claiming Rewards" },
  { id: "leaderboards", label: "Leaderboards" },
  { id: "security", label: "Security" },
  { id: "faq", label: "FAQ" },
];

function TableOfContents() {
  return (
    <nav className="sticky top-20 space-y-1">
      <h3 className="text-sm font-semibold text-white mb-4">Contents</h3>
      {TOC_ITEMS.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="block text-sm py-1.5 px-3 rounded-lg transition-colors text-[#9AA3B2] hover:text-white hover:bg-white/[0.04]"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 mb-12">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
        <span className="h-1 w-6 bg-emerald-500 rounded-full" />
        {title}
      </h2>
      <div className="text-[#9AA3B2] space-y-3 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <HodlrLayout>
      <div className="px-4 md:px-6 pt-6 pb-12">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-4">
            <BookOpen className="h-4 w-4" />
            Documentation
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            HODLR Documentation
          </h1>
          <p className="text-[#9AA3B2] max-w-2xl">
            Everything you need to know about HODLR. Rewards for diamond hands - 
            the longer you hold, the more you earn.
          </p>
        </div>

        <div className="flex gap-12">
          {/* Sidebar */}
          <aside className="hidden lg:block w-48 shrink-0">
            <TableOfContents />
          </aside>

          {/* Main Content */}
          <div className="flex-1 max-w-3xl">
            <Section id="overview" title="What is HODLR?">
              <p>
                <strong className="text-white">HODLR</strong> is a holder rewards protocol built on Solana. 
                It rewards token holders based on how long they&apos;ve held their tokens — the longer you hold, 
                the greater your share of the reward pool.
              </p>
              <div className="grid sm:grid-cols-3 gap-4 mt-6">
                <div className="p-4 text-center rounded-lg border border-white/[0.06] bg-white/[0.02]">
                  <Timer className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <div className="text-sm font-medium text-white">Hold Longer</div>
                  <div className="text-xs text-[#9AA3B2]">Duration increases weight</div>
                </div>
                <div className="p-4 text-center rounded-lg border border-white/[0.06] bg-white/[0.02]">
                  <TrendingUp className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <div className="text-sm font-medium text-white">Earn More</div>
                  <div className="text-xs text-[#9AA3B2]">Higher rank = bigger share</div>
                </div>
                <div className="p-4 text-center rounded-lg border border-white/[0.06] bg-white/[0.02]">
                  <Gift className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <div className="text-sm font-medium text-white">Claim SOL</div>
                  <div className="text-xs text-[#9AA3B2]">Weekly reward distributions</div>
                </div>
              </div>
            </Section>

            <Section id="how-it-works" title="How It Works">
              <ol className="space-y-4">
                <li className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-black font-bold text-sm">1</span>
                  <div>
                    <div className="font-medium text-white">Hold Tokens</div>
                    <p className="text-sm">Simply hold tokens in your wallet. Your holding duration is tracked automatically from the moment you acquire tokens.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-black font-bold text-sm">2</span>
                  <div>
                    <div className="font-medium text-white">Weekly Snapshots</div>
                    <p className="text-sm">At the end of each epoch (weekly), a snapshot captures all holder balances and holding durations. Rankings are calculated based on this data.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-black font-bold text-sm">3</span>
                  <div>
                    <div className="font-medium text-white">Rewards Distributed</div>
                    <p className="text-sm">The reward pool is distributed to the top 50 holders based on their weighted score. Your weight is determined by holding duration and balance.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-black font-bold text-sm">4</span>
                  <div>
                    <div className="font-medium text-white">Claim Your SOL</div>
                    <p className="text-sm">Once the claim window opens, connect your wallet and claim your rewards. SOL is sent directly to your wallet.</p>
                  </div>
                </li>
              </ol>
            </Section>

            <Section id="eligibility" title="Eligibility">
              <p>To be eligible for HODLR rewards:</p>
              <ul className="list-disc list-inside space-y-2 text-sm mt-4">
                <li><strong className="text-white">Hold tokens</strong> — You must hold the tracked token in your wallet</li>
                <li><strong className="text-white">Maintain balance</strong> — Selling or decreasing your balance resets your holding duration</li>
                <li><strong className="text-white">Top 50 ranking</strong> — Only the top 50 holders by weighted score receive rewards each epoch</li>
              </ul>
              
              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
                <strong className="text-amber-400">Important:</strong>
                <p className="text-[#9AA3B2] mt-1">If you sell any tokens, your holding duration resets to zero. Diamond hands are rewarded — paper hands are not.</p>
              </div>
            </Section>

            <Section id="epochs" title="Epochs & Distributions">
              <p>HODLR operates on a weekly epoch cycle:</p>
              
              <h3 className="text-base font-semibold text-white mt-6 mb-3">Epoch Lifecycle</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li><strong className="text-white">Active:</strong> Holding duration is being tracked</li>
                <li><strong className="text-white">Snapshot:</strong> Balances and durations are captured</li>
                <li><strong className="text-white">Ranked:</strong> Top 50 holders are determined</li>
                <li><strong className="text-white">Claim Open:</strong> Eligible holders can claim rewards</li>
                <li><strong className="text-white">Claim Closed:</strong> Window ends, unclaimed funds roll over</li>
              </ul>

              <h3 className="text-base font-semibold text-white mt-6 mb-3">Weight Formula</h3>
              <p className="text-sm">
                Your reward share is calculated using: <code className="px-2 py-1 rounded bg-white/[0.06] text-emerald-400 font-mono text-xs">weight = (holding_days ^ 0.6) × (balance ^ 0.4)</code>
              </p>
              <p className="text-sm mt-2">
                This formula rewards both long-term holders and larger balances, with a slight bias toward holding duration.
              </p>
            </Section>

            <Section id="claiming" title="Claiming Rewards">
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Go to the <Link href="/claims" className="text-emerald-400 hover:underline">Claims</Link> page</li>
                <li>Connect your Solana wallet (Phantom, Solflare, or Backpack)</li>
                <li>If you&apos;re eligible, you&apos;ll see your claimable amount</li>
                <li>Click &quot;Claim&quot; and sign the transaction</li>
                <li>SOL is sent directly to your connected wallet</li>
              </ol>

              <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
                <strong className="text-emerald-400">Claim Window:</strong>
                <p className="text-[#9AA3B2] mt-1">Claims are open for a limited time after each epoch ends. Unclaimed rewards roll over to the next epoch&apos;s pool.</p>
              </div>
            </Section>

            <Section id="leaderboards" title="Leaderboards">
              <p>The <Link href="/leaderboards" className="text-emerald-400 hover:underline">Leaderboards</Link> page shows:</p>
              <ul className="list-disc list-inside space-y-2 text-sm mt-4">
                <li><strong className="text-white">Top Holders:</strong> Current epoch&apos;s top 50 ranked by weighted score</li>
                <li><strong className="text-white">Top Earners:</strong> All-time cumulative earnings leaderboard</li>
              </ul>
              <p className="mt-4 text-sm">
                Rankings are updated after each epoch snapshot. Check the leaderboards to see where you stand and how much you could earn.
              </p>
            </Section>

            <Section id="security" title="Security">
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Wallet signatures required for all claim actions</li>
                <li>No private keys stored — all transactions signed client-side</li>
                <li>On-chain escrow for reward pools with transparent tracking</li>
                <li>One claim per wallet per epoch, enforced at the database level</li>
              </ul>

              <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm">
                <strong className="text-red-400">Security Warning:</strong>
                <p className="text-[#9AA3B2] mt-1">Never share your seed phrase. HODLR will never ask for your private keys. Always verify you are on the correct domain before signing transactions.</p>
              </div>
            </Section>

            <Section id="faq" title="FAQ">
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-white mb-2">How much can I earn?</h4>
                  <p className="text-sm">Earnings depend on the reward pool size, your holding duration, your balance, and your rank among other holders. Only the top 50 holders receive rewards each epoch.</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">What happens if I sell some tokens?</h4>
                  <p className="text-sm">Any decrease in your balance resets your holding duration to zero. You&apos;ll need to start building duration again from scratch.</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">Can I buy more tokens without losing my duration?</h4>
                  <p className="text-sm">Yes! Increasing your balance does not affect your holding duration. Only decreases reset your duration.</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">How often are rewards distributed?</h4>
                  <p className="text-sm">Rewards are calculated and distributed at the end of each epoch (weekly). You can claim your rewards during the claim window.</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">What if I don&apos;t claim in time?</h4>
                  <p className="text-sm">Unclaimed rewards roll over to the next epoch&apos;s reward pool, benefiting future distributions.</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">Which wallets are supported?</h4>
                  <p className="text-sm">Phantom, Solflare, and Backpack are fully supported.</p>
                </div>
              </div>
            </Section>

            {/* CTA */}
            <div className="mt-12 p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-center">
              <h3 className="text-lg font-bold text-white mb-2">Ready to start earning?</h3>
              <p className="text-[#9AA3B2] mb-4 text-sm">Check the leaderboard to see where you stand.</p>
              <div className="flex justify-center gap-3">
                <Link 
                  href="/leaderboards"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400 transition-colors"
                >
                  View Leaderboards
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link 
                  href="/claims"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/[0.1] text-white font-semibold text-sm hover:bg-white/[0.04] transition-colors"
                >
                  Claim Rewards
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </HodlrLayout>
  );
}

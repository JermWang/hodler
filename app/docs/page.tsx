"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  BookOpen, Zap, Users, Coins, Shield, Twitter, 
  Wallet, TrendingUp, Gift, Clock, ChevronRight,
  ExternalLink, Copy, Check, ArrowRight
} from "lucide-react";
import { DataCard } from "@/app/components/ui/data-card";

const TOC_ITEMS = [
  { id: "overview", label: "Platform Overview" },
  { id: "how-it-works", label: "How It Works" },
  { id: "for-holders", label: "For Holders" },
  { id: "for-projects", label: "For Projects" },
  { id: "campaigns", label: "Campaigns & Epochs" },
  { id: "engagement", label: "Engagement Scoring" },
  { id: "rewards", label: "Rewards & Claiming" },
  { id: "launch", label: "Launching on Pump.fun" },
  { id: "technical", label: "Technical Details" },
  { id: "faq", label: "FAQ" },
];

function TableOfContents({ activeSection }: { activeSection: string }) {
  return (
    <nav className="sticky top-24 space-y-1">
      <h3 className="text-sm font-semibold text-white mb-4">Contents</h3>
      {TOC_ITEMS.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={`block text-sm py-1.5 px-3 rounded-lg transition-colors ${
            activeSection === item.id
              ? "bg-amplifi-lime/10 text-amplifi-lime"
              : "text-foreground-secondary hover:text-white hover:bg-dark-elevated"
          }`}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 mb-16">
      <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
        <span className="h-1 w-8 bg-amplifi-lime rounded-full" />
        {title}
      </h2>
      <div className="text-foreground-secondary space-y-4">
        {children}
      </div>
    </section>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("overview");

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="mx-auto max-w-[1280px] px-6 pt-28 pb-16">
        {/* Header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amplifi-lime/10 border border-amplifi-lime/20 text-amplifi-lime text-sm font-medium mb-4">
            <BookOpen className="h-4 w-4" />
            Documentation
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            AmpliFi Documentation
          </h1>
          <p className="text-lg text-foreground-secondary max-w-2xl">
            Everything you need to know about the AmpliFi protocol. The holder-driven 
            exposure platform that turns your community into your marketing engine.
          </p>
        </div>

        <div className="flex gap-12">
          {/* Sidebar */}
          <aside className="hidden lg:block w-56 shrink-0">
            <TableOfContents activeSection={activeSection} />
          </aside>

          {/* Main Content */}
          <div className="flex-1 max-w-3xl">
            <Section id="overview" title="Platform Overview">
              <p>
                <strong className="text-white">AmpliFi</strong> is a holder-driven exposure protocol built on Solana. 
                It creates a win-win ecosystem where token projects pay their holders to organically promote 
                the project on social media, verified through on-chain ownership and Twitter engagement tracking.
              </p>
              <div className="grid sm:grid-cols-3 gap-4 mt-6">
                <DataCard className="p-4 text-center">
                  <Coins className="h-8 w-8 text-amplifi-lime mx-auto mb-2" />
                  <div className="text-sm font-medium text-white">Projects Pay</div>
                  <div className="text-xs text-foreground-secondary">Creator fees fund rewards</div>
                </DataCard>
                <DataCard className="p-4 text-center">
                  <Twitter className="h-8 w-8 text-amplifi-purple mx-auto mb-2" />
                  <div className="text-sm font-medium text-white">Holders Engage</div>
                  <div className="text-xs text-foreground-secondary">Tweet to earn points</div>
                </DataCard>
                <DataCard className="p-4 text-center">
                  <Gift className="h-8 w-8 text-amplifi-teal mx-auto mb-2" />
                  <div className="text-sm font-medium text-white">Earn Rewards</div>
                  <div className="text-xs text-foreground-secondary">Claim SOL each epoch</div>
                </DataCard>
              </div>
            </Section>

            <Section id="how-it-works" title="How It Works">
              <ol className="space-y-4">
                <li className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amplifi-lime text-dark-bg font-bold text-sm">1</span>
                  <div>
                    <div className="font-medium text-white">Project Launches with AmpliFi</div>
                    <p className="text-sm">A token project integrates AmpliFi, directing a portion of creator fees to the reward pool. This can be done during a new launch on Pump.fun or by creating a campaign for an existing token.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amplifi-purple text-white font-bold text-sm">2</span>
                  <div>
                    <div className="font-medium text-white">Holders Connect & Engage</div>
                    <p className="text-sm">Token holders connect their Solana wallet and link their Twitter account. They then engage with the project by tweeting, replying, retweeting, or quoting posts that mention the project.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amplifi-teal text-dark-bg font-bold text-sm">3</span>
                  <div>
                    <div className="font-medium text-white">Engagement is Tracked & Scored</div>
                    <p className="text-sm">AmpliFi tracks Twitter activity for registered holders. Each engagement type earns points, weighted by the holder&apos;s token balance and consistency.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amplifi-orange text-white font-bold text-sm">4</span>
                  <div>
                    <div className="font-medium text-white">Epochs Settle & Rewards Distribute</div>
                    <p className="text-sm">At the end of each epoch (typically 24 hours), the reward pool is distributed proportionally based on each holder&apos;s engagement score. Holders can then claim their SOL rewards.</p>
                  </div>
                </li>
              </ol>
            </Section>

            <Section id="for-holders" title="For Holders">
              <p>As a token holder, you can earn passive income by simply promoting projects you already believe in.</p>
              
              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Getting Started</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Go to the <Link href="/holder" className="text-amplifi-lime hover:underline">Dashboard</Link></li>
                <li>Connect your Solana wallet (Phantom, Solflare, or Backpack)</li>
                <li>Link your Twitter account by signing a message</li>
                <li>Hold tokens from AmpliFi-enabled projects</li>
                <li>Engage on Twitter by mentioning the project</li>
                <li>Claim your rewards after each epoch settles</li>
              </ol>

              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Requirements</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Hold the minimum required token balance (set by each campaign)</li>
                <li><strong className="text-amplifi-purple">X Premium (Blue) verified account</strong> linked to your wallet</li>
                <li>Engage authentically. Spam and bot activity is filtered</li>
              </ul>
              <div className="mt-4 p-3 rounded-lg bg-amplifi-purple/10 border border-amplifi-purple/20 text-sm">
                <strong className="text-amplifi-purple">Why verified accounts only?</strong>
                <p className="text-foreground-secondary mt-1">To protect reward pools from bot manipulation and ensure meaningful payouts for real users, only X Premium verified accounts are eligible to earn rewards. This creates a higher-quality community and more significant rewards per participant.</p>
              </div>
            </Section>

            <Section id="for-projects" title="For Projects">
              <p>AmpliFi gives projects a built-in marketing army without upfront influencer costs.</p>
              
              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Benefits</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li><strong className="text-white">Organic Reach:</strong> Your holders become authentic promoters</li>
                <li><strong className="text-white">Pay for Results:</strong> Rewards only go to verified engagement</li>
                <li><strong className="text-white">Holder Retention:</strong> Incentivizes holding over selling</li>
                <li><strong className="text-white">Transparent:</strong> All fees and distributions are on-chain</li>
              </ul>

              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Fee Structure (Pump.fun Route)</h3>
              <p className="text-sm">
                Creator fees are split <strong className="text-white">50/50</strong> between the holder reward pool and the creator. 
                For example, if a campaign generates 10 SOL in creator fees, 5 SOL goes to the reward pool for holders who engage, and 5 SOL goes back to you (the token creator).
              </p>
              <p className="text-sm mt-2">
                Creators can track their campaigns and view distributions via the <Link href="/creator" className="text-amplifi-lime hover:underline">Creator Dashboard</Link>.
              </p>
            </Section>

            <Section id="campaigns" title="Campaigns & Epochs">
              <p>Campaigns are the core unit of AmpliFi. Each campaign tracks engagement for a specific token over a defined period.</p>
              
              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Campaign Structure</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li><strong className="text-white">Token Mint:</strong> The SPL token being tracked</li>
                <li><strong className="text-white">Tracking Handles:</strong> X handles to monitor (e.g., @ProjectName)</li>
                <li><strong className="text-white">Tracking Tags:</strong> Hashtags (#project) and cashtags ($TICKER) that count as engagement</li>
                <li><strong className="text-white">Tracking URLs:</strong> Links to the project website or token page</li>
                <li><strong className="text-white">Minimum Balance:</strong> Required token holding to participate (can be zero)</li>
                <li><strong className="text-white">Duration:</strong> Campaign start and end dates</li>
              </ul>

              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Epochs</h3>
              <p className="text-sm">
                Epochs are 24-hour periods within a campaign. At the end of each epoch, engagement scores 
                are calculated and rewards are distributed. This creates regular, predictable payouts for 
                active participants.
              </p>
            </Section>

            <Section id="engagement" title="Engagement Scoring">
              <p>Not all engagement is equal. AmpliFi uses a weighted scoring system:</p>
              
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                <DataCard className="p-4 text-center">
                  <div className="text-2xl font-bold text-amplifi-orange">10</div>
                  <div className="text-xs text-foreground-secondary">Original Tweet</div>
                </DataCard>
                <DataCard className="p-4 text-center">
                  <div className="text-2xl font-bold text-amplifi-lime">6</div>
                  <div className="text-xs text-foreground-secondary">Quote Tweet</div>
                </DataCard>
                <DataCard className="p-4 text-center">
                  <div className="text-2xl font-bold text-amplifi-purple">5</div>
                  <div className="text-xs text-foreground-secondary">Reply</div>
                </DataCard>
                <DataCard className="p-4 text-center">
                  <div className="text-2xl font-bold text-amplifi-teal">3</div>
                  <div className="text-xs text-foreground-secondary">Retweet</div>
                </DataCard>
                <DataCard className="p-4 text-center">
                  <div className="text-2xl font-bold text-foreground-secondary">1</div>
                  <div className="text-xs text-foreground-secondary">Like</div>
                </DataCard>
              </div>

              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Score Multipliers</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li><strong className="text-white">Balance Weight (0.1x-10x):</strong> Uses square-root scaling based on your share of total supply. This prevents whales from dominating while still rewarding larger holders.</li>
                <li><strong className="text-white">Consistency Bonus (1x-1.5x):</strong> Engaging regularly across multiple days in an epoch increases your multiplier up to 50%.</li>
                <li><strong className="text-white">Influence Multiplier (1x-3x):</strong> Accounts with larger followings receive a boost, as their reach provides more value to the project.</li>
                <li><strong className="text-white">Anti-Spam Dampener:</strong> Duplicate content, repetitive patterns, or excessive frequency reduces scores to zero.</li>
              </ul>

              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Top Earners Limit</h3>
              <p className="text-sm">
                Each epoch distributes rewards to the <strong className="text-white">top 99 highest-scoring participants</strong>. This ensures meaningful payouts rather than diluting rewards across thousands of low-effort accounts.
              </p>
            </Section>

            <Section id="rewards" title="Rewards & Claiming">
              <p>Rewards are distributed at the end of each epoch, typically in SOL or the campaign&apos;s designated SPL token.</p>
              
              <h3 className="text-lg font-semibold text-white mt-6 mb-3">How Rewards are Calculated</h3>
              <p className="text-sm">
                Your share of the reward pool = (Your Score / Total Pool Score) &times; Pool Size
              </p>
              <p className="text-sm mt-2">
                The more you engage relative to other holders, the larger your share. Remember: only the <strong className="text-white">top 99 scorers</strong> per epoch receive rewards.
              </p>

              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Reward Types</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li><strong className="text-white">SOL Rewards:</strong> Most campaigns distribute native SOL</li>
                <li><strong className="text-white">SPL Token Rewards:</strong> Some campaigns may distribute their native token or stablecoins</li>
              </ul>

              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Claiming</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Go to your <Link href="/holder" className="text-amplifi-lime hover:underline">Dashboard</Link></li>
                <li>View your pending rewards for each campaign</li>
                <li>Click &quot;Claim&quot; to receive rewards directly to your wallet</li>
                <li>Sign the transaction to complete the claim</li>
              </ol>
            </Section>

            <Section id="launch" title="Launching on Pump.fun">
              <p>
                AmpliFi integrates with <a href="https://pump.fun" target="_blank" rel="noopener noreferrer" className="text-amplifi-lime hover:underline">Pump.fun</a> for 
                seamless token launches with built-in holder rewards.
              </p>
              
              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Launch Flow</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Go to the <Link href="/launch" className="text-amplifi-lime hover:underline">Launch</Link> page</li>
                <li>Fill in your token details (name, ticker, description, image)</li>
                <li>Set your X handle and tracking tags for the campaign</li>
                <li>Connect your wallet and sign the launch transaction</li>
                <li>Your token launches on Pump.fun with a vanity contract address ending in &quot;AMP&quot;</li>
              </ol>

              <h3 className="text-lg font-semibold text-white mt-6 mb-3">What You Get</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li><strong className="text-white">Vanity Contract Address:</strong> All AmpliFi launches get a memorable address ending in &quot;AMP&quot;</li>
                <li><strong className="text-white">Auto-Configured Campaign:</strong> Your campaign starts tracking engagement immediately</li>
                <li><strong className="text-white">Creator Dashboard:</strong> Monitor your token&apos;s performance and holder engagement</li>
                <li><strong className="text-white">Transparent Bundler:</strong> Fair launch with no hidden dev allocations</li>
              </ul>
            </Section>

            <Section id="technical" title="Technical Details">
              <h3 className="text-lg font-semibold text-white mb-3">Architecture</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li><strong className="text-white">Blockchain:</strong> Solana (mainnet-beta)</li>
                <li><strong className="text-white">Token Standard:</strong> SPL Token / Token-2022</li>
                <li><strong className="text-white">Launch Platform:</strong> Pump.fun integration</li>
                <li><strong className="text-white">Wallet Support:</strong> Phantom, Solflare, Backpack</li>
                <li><strong className="text-white">X Integration:</strong> OAuth 2.0 with read-only access</li>
              </ul>

              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Data Sources</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li><strong className="text-white">Token Data:</strong> Helius DAS API, DexScreener</li>
                <li><strong className="text-white">Price Data:</strong> Jupiter Aggregator, Pump.fun API</li>
                <li><strong className="text-white">Social Data:</strong> X API v2 (Basic tier with 500K posts/month)</li>
              </ul>

              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Engagement Tracking</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li><strong className="text-white">Polling Frequency:</strong> Every 15 minutes via automated cron</li>
                <li><strong className="text-white">Epoch Settlement:</strong> Automatic at end of each 24-hour epoch</li>
                <li><strong className="text-white">Score Calculation:</strong> Real-time with anti-spam filters</li>
              </ul>

              <h3 className="text-lg font-semibold text-white mt-6 mb-3">Security</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Wallet signatures required for all sensitive actions</li>
                <li>No private keys stored - all transactions signed client-side</li>
                <li>X Premium verification required to prevent bot manipulation</li>
                <li>On-chain escrow for reward pools with transparent tracking</li>
              </ul>
            </Section>

            <Section id="faq" title="FAQ">
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-white mb-2">How much can I earn?</h4>
                  <p className="text-sm">Earnings depend on the campaign&apos;s reward pool size, your token holdings, your engagement quality, and how you rank among other participants. Only the top 99 scorers per epoch receive rewards, so active and consistent engagement is key.</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">Why do I need X Premium (Blue) verification?</h4>
                  <p className="text-sm">X Premium verification is required to protect reward pools from bot manipulation. This ensures meaningful payouts go to real users rather than being diluted across fake accounts.</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">Is my X account safe?</h4>
                  <p className="text-sm">Yes. We only request read-only access to verify your account and track public engagement. We never post on your behalf or access private data like DMs.</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">What if I sell my tokens?</h4>
                  <p className="text-sm">Your engagement score is weighted by your token balance. If you sell, your balance multiplier decreases accordingly. You can still earn, but holders with larger positions receive higher multipliers.</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">Can I participate in multiple campaigns?</h4>
                  <p className="text-sm">Yes! You can hold multiple tokens and earn from all their respective campaigns simultaneously. Each campaign tracks engagement independently.</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">What counts as engagement?</h4>
                  <p className="text-sm">Original tweets mentioning the project (10 pts), quote tweets (6 pts), replies (5 pts), and retweets (3 pts). Your tweet must include the campaign&apos;s tracked handles, hashtags, or cashtags.</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">How often are rewards distributed?</h4>
                  <p className="text-sm">Rewards are calculated and distributed at the end of each epoch (24 hours). You can claim your rewards anytime after an epoch settles.</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">How do I report issues?</h4>
                  <p className="text-sm">Reach out on X <a href="https://x.com/AmpliFiSocial" target="_blank" rel="noopener noreferrer" className="text-amplifi-lime hover:underline">@AmpliFiSocial</a> or join our community channels.</p>
                </div>
              </div>
            </Section>

            {/* CTA */}
            <div className="mt-16 p-8 rounded-2xl border border-amplifi-lime/20 bg-amplifi-lime/5 text-center">
              <h3 className="text-xl font-bold text-white mb-2">Ready to get started?</h3>
              <p className="text-foreground-secondary mb-6">Connect your wallet and start earning from your holdings.</p>
              <div className="flex justify-center gap-4">
                <Link 
                  href="/holder"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amplifi-lime text-dark-bg font-semibold hover:bg-amplifi-lime/90 transition-colors"
                >
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link 
                  href="/discover"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-dark-border text-white font-semibold hover:bg-dark-elevated transition-colors"
                >
                  Explore Tokens
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { getProjectProfile } from "@/app/lib/projectProfilesStore";
import { getSafeErrorMessage } from "@/app/lib/safeError";
import { fetchDexScreenerPairsByTokenMint, pickBestDexScreenerPair } from "@/app/lib/dexScreener";

export const runtime = "nodejs";

function normalizeHttpUrl(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

function pickFirstUrl(entries: Array<{ url?: string; label?: string }> | undefined): string | null {
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    const url = normalizeHttpUrl(entry?.url);
    if (url) return url;
  }
  return null;
}

function pickSocialUrl(entries: Array<{ url?: string; type?: string }> | undefined, type: string): string | null {
  if (!Array.isArray(entries)) return null;
  const desired = String(type).trim().toLowerCase();
  for (const entry of entries) {
    const entryType = String(entry?.type ?? "").trim().toLowerCase();
    if (entryType !== desired) continue;
    const url = normalizeHttpUrl(entry?.url);
    if (url) return url;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mintRaw = String(searchParams.get("mint") ?? "").trim();
    if (!mintRaw) {
      return NextResponse.json({ error: "mint is required" }, { status: 400 });
    }

    let mint: string;
    try {
      mint = new PublicKey(mintRaw).toBase58();
    } catch {
      return NextResponse.json({ error: "Invalid mint address" }, { status: 400 });
    }

    const profile = await getProjectProfile(mint).catch(() => null);

    let dexName: string | null = null;
    let dexSymbol: string | null = null;
    let dexImageUrl: string | null = null;
    let dexWebsiteUrl: string | null = null;
    let dexXUrl: string | null = null;
    let dexTelegramUrl: string | null = null;
    let dexDiscordUrl: string | null = null;

    try {
      const { pairs } = await fetchDexScreenerPairsByTokenMint({ tokenMint: mint, timeoutMs: 4000 });
      const best = pickBestDexScreenerPair({ pairs, chainId: "solana", minLiquidityUsd: 0 });
      if (best) {
        dexName = best.baseToken?.name ? String(best.baseToken.name).trim() : null;
        dexSymbol = best.baseToken?.symbol ? String(best.baseToken.symbol).trim() : null;
        dexImageUrl = normalizeHttpUrl(best.info?.imageUrl);
        dexWebsiteUrl = pickFirstUrl(best.info?.websites);
        dexXUrl = pickSocialUrl(best.info?.socials, "twitter") || pickSocialUrl(best.info?.socials, "x");
        dexTelegramUrl = pickSocialUrl(best.info?.socials, "telegram");
        dexDiscordUrl = pickSocialUrl(best.info?.socials, "discord");
      }
    } catch {
      // Ignore DexScreener failures and fall back to stored profile
    }

    const project = {
      tokenMint: mint,
      name: profile?.name ?? dexName ?? null,
      symbol: profile?.symbol ?? dexSymbol ?? null,
      description: profile?.description ?? null,
      imageUrl: profile?.imageUrl ?? dexImageUrl ?? null,
      websiteUrl: profile?.websiteUrl ?? dexWebsiteUrl ?? null,
      xUrl: profile?.xUrl ?? dexXUrl ?? null,
      telegramUrl: profile?.telegramUrl ?? dexTelegramUrl ?? null,
      discordUrl: profile?.discordUrl ?? dexDiscordUrl ?? null,
    };

    const hasDetails = Boolean(
      project.name ||
        project.symbol ||
        project.description ||
        project.imageUrl ||
        project.websiteUrl ||
        project.xUrl ||
        project.telegramUrl ||
        project.discordUrl
    );

    if (!hasDetails) {
      return NextResponse.json({ error: "No token details found" }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

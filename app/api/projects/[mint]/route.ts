import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { getProjectProfile, upsertProjectProfile } from "../../../lib/projectProfilesStore";
import { getSafeErrorMessage } from "../../../lib/safeError";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: { mint: string } }) {
  try {
    const mintRaw = String(ctx?.params?.mint ?? "").trim();
    if (!mintRaw) return NextResponse.json({ error: "mint is required" }, { status: 400 });

    const mint = new PublicKey(mintRaw).toBase58();
    const project = await getProjectProfile(mint);
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

function normalizeHttpUrl(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) throw new Error("url must be http(s)");
  return s;
}

export async function POST(req: Request, ctx: { params: { mint: string } }) {
  try {
    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mintRaw = String(ctx?.params?.mint ?? "").trim();
    if (!mintRaw) return NextResponse.json({ error: "mint is required" }, { status: 400 });
    const mint = new PublicKey(mintRaw).toBase58();

    const body = (await req.json().catch(() => null)) as any;

    const name = body?.name == null ? null : String(body.name).trim();
    const symbol = body?.symbol == null ? null : String(body.symbol).trim();
    const description = body?.description == null ? null : String(body.description);

    let websiteUrl: string | null = null;
    let xUrl: string | null = null;
    let telegramUrl: string | null = null;
    let discordUrl: string | null = null;
    let imageUrl: string | null = null;
    let metadataUri: string | null = null;

    try {
      websiteUrl = normalizeHttpUrl(body?.websiteUrl);
      xUrl = normalizeHttpUrl(body?.xUrl);
      telegramUrl = normalizeHttpUrl(body?.telegramUrl);
      discordUrl = normalizeHttpUrl(body?.discordUrl);
      imageUrl = normalizeHttpUrl(body?.imageUrl);
      metadataUri = normalizeHttpUrl(body?.metadataUri);
    } catch (e) {
      return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 400 });
    }

    if (name != null && name.length > 48) {
      return NextResponse.json({ error: "name too long (max 48)" }, { status: 400 });
    }
    if (symbol != null && symbol.length > 16) {
      return NextResponse.json({ error: "symbol too long (max 16)" }, { status: 400 });
    }
    if (description != null && description.length > 600) {
      return NextResponse.json({ error: "description too long (max 600)" }, { status: 400 });
    }

    const project = await upsertProjectProfile({
      tokenMint: mint,
      name,
      symbol,
      description,
      websiteUrl,
      xUrl,
      telegramUrl,
      discordUrl,
      imageUrl,
      metadataUri,
    });

    return NextResponse.json({ ok: true, project });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { hasDatabase, getPool } from "@/app/lib/db";

/**
 * GET /api/holder/registration
 * 
 * Get holder registration status (Twitter verification)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const walletPubkey = searchParams.get("wallet");

    if (!walletPubkey) {
      return NextResponse.json(
        { error: "Missing wallet parameter" },
        { status: 400 }
      );
    }

    if (!hasDatabase()) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT 
         id, wallet_pubkey, twitter_user_id, twitter_username, 
         twitter_display_name, twitter_profile_image_url,
         verified_at_unix, status, created_at_unix
       FROM public.holder_registrations 
       WHERE wallet_pubkey = $1`,
      [walletPubkey]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        registered: false,
        registration: null,
      });
    }

    const row = result.rows[0];
    
    return NextResponse.json({
      registered: true,
      registration: {
        id: row.id,
        walletPubkey: row.wallet_pubkey,
        twitterUserId: row.twitter_user_id,
        twitterUsername: row.twitter_username,
        twitterDisplayName: row.twitter_display_name,
        twitterProfileImageUrl: row.twitter_profile_image_url,
        verifiedAtUnix: Number(row.verified_at_unix),
        status: row.status,
        createdAtUnix: Number(row.created_at_unix),
      },
    });
  } catch (error) {
    console.error("Failed to fetch holder registration:", error);
    return NextResponse.json(
      { error: "Failed to fetch registration" },
      { status: 500 }
    );
  }
}

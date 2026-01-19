import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getAuthenticatedUser } from "@/app/lib/twitter";
import { getPool, hasDatabase } from "@/app/lib/db";
import crypto from "crypto";

/**
 * GET /api/twitter/callback
 * 
 * Twitter OAuth 2.0 callback handler.
 * Exchanges authorization code for tokens and creates holder registration.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Handle OAuth errors
    if (error) {
      console.error("Twitter OAuth error:", error);
      return NextResponse.redirect(
        new URL(`/holder?error=${encodeURIComponent(error)}`, req.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/holder?error=missing_params", req.url)
      );
    }

    if (!hasDatabase()) {
      return NextResponse.redirect(
        new URL("/holder?error=database_unavailable", req.url)
      );
    }

    const pool = getPool();
    const nowUnix = Math.floor(Date.now() / 1000);

    // Retrieve and validate OAuth state
    const stateResult = await pool.query(
      `SELECT wallet_pubkey, code_verifier, signature 
       FROM public.twitter_oauth_states 
       WHERE state = $1 AND expires_at_unix > $2`,
      [state, nowUnix]
    );

    if (stateResult.rows.length === 0) {
      return NextResponse.redirect(
        new URL("/holder?error=invalid_state", req.url)
      );
    }

    const { wallet_pubkey: walletPubkey, code_verifier: codeVerifier, signature } = stateResult.rows[0];

    // Delete used state
    await pool.query("DELETE FROM public.twitter_oauth_states WHERE state = $1", [state]);

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, codeVerifier);

    // Get Twitter user info
    const twitterUser = await getAuthenticatedUser(tokens.access_token);

    // Check if Twitter account is already linked to another wallet
    const existingTwitter = await pool.query(
      `SELECT wallet_pubkey FROM public.holder_registrations 
       WHERE twitter_user_id = $1 AND wallet_pubkey != $2`,
      [twitterUser.id, walletPubkey]
    );

    if (existingTwitter.rows.length > 0) {
      return NextResponse.redirect(
        new URL("/holder?error=twitter_already_linked", req.url)
      );
    }

    // Check if wallet is already linked to another Twitter account
    const existingWallet = await pool.query(
      `SELECT twitter_user_id FROM public.holder_registrations 
       WHERE wallet_pubkey = $1 AND twitter_user_id != $2`,
      [walletPubkey, twitterUser.id]
    );

    if (existingWallet.rows.length > 0) {
      return NextResponse.redirect(
        new URL("/holder?error=wallet_already_linked", req.url)
      );
    }

    // Create or update holder registration
    const registrationId = crypto.randomUUID();
    
    await pool.query(
      `INSERT INTO public.holder_registrations 
       (id, wallet_pubkey, twitter_user_id, twitter_username, twitter_display_name, 
        twitter_profile_image_url, twitter_access_token, twitter_refresh_token, 
        twitter_token_expires_at_unix, verified_at_unix, verification_signature, 
        status, created_at_unix, updated_at_unix)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (wallet_pubkey) DO UPDATE SET
         twitter_user_id = EXCLUDED.twitter_user_id,
         twitter_username = EXCLUDED.twitter_username,
         twitter_display_name = EXCLUDED.twitter_display_name,
         twitter_profile_image_url = EXCLUDED.twitter_profile_image_url,
         twitter_access_token = EXCLUDED.twitter_access_token,
         twitter_refresh_token = EXCLUDED.twitter_refresh_token,
         twitter_token_expires_at_unix = EXCLUDED.twitter_token_expires_at_unix,
         updated_at_unix = EXCLUDED.updated_at_unix`,
      [
        registrationId,
        walletPubkey,
        twitterUser.id,
        twitterUser.username,
        twitterUser.name,
        twitterUser.profile_image_url || null,
        tokens.access_token,
        tokens.refresh_token,
        Math.floor(tokens.expires_at / 1000),
        nowUnix,
        signature,
        "active",
        nowUnix,
        nowUnix,
      ]
    );

    // Redirect to success page
    return NextResponse.redirect(
      new URL(`/holder?success=true&username=${twitterUser.username}`, req.url)
    );
  } catch (error) {
    console.error("Twitter callback error:", error);
    return NextResponse.redirect(
      new URL("/holder?error=callback_failed", req.url)
    );
  }
}

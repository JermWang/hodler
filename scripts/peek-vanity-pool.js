/**
 * peek-vanity-pool.js
 * Shows the next available vanity addresses queued in the DB (public keys only).
 * Run: node scripts/peek-vanity-pool.js
 * Requires: DATABASE_URL in env (or .env.local)
 */

require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const suffixes = ["HoDL", "pump"];

  for (const suffix of suffixes) {
    const { rows } = await pool.query(
      `select public_key, created_at_unix
       from public.vanity_keypairs
       where suffix = $1 and used_at_unix is null and reserved_at_unix is null
       order by created_at_unix asc
       limit 5`,
      [suffix]
    );

    const countRes = await pool.query(
      `select count(*)::int as total
       from public.vanity_keypairs
       where suffix = $1 and used_at_unix is null and reserved_at_unix is null`,
      [suffix]
    );

    const total = countRes.rows[0]?.total ?? 0;
    console.log(`\n── ${suffix} ─── (${total} available in pool) ──────────────`);

    if (rows.length === 0) {
      console.log("  (pool empty)");
    } else {
      rows.forEach((r, i) => {
        const label = i === 0 ? "NEXT →" : `     ${i + 1}.`;
        console.log(`  ${label}  ${r.public_key}`);
      });
    }
  }

  await pool.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });

const dotenv = require("dotenv");
dotenv.config({ path: ".env.local" });

const { Pool } = require("pg");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const res = await pool.query(`
      SELECT ts_unix, event, fields 
      FROM audit_logs 
      WHERE fields::text LIKE '%3305481f8b90b078%'
      OR (event LIKE 'launch_%' AND ts_unix > extract(epoch from now()) - 3600)
      ORDER BY ts_unix DESC 
      LIMIT 20
    `);
    
    console.log("Recent launch audit logs:");
    for (const row of res.rows) {
      const date = new Date(row.ts_unix * 1000).toISOString();
      console.log(`\n[${date}] ${row.event}`);
      console.log(JSON.stringify(row.fields, null, 2));
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

main();

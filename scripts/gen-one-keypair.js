/**
 * One-shot vanity keypair generator.
 * Runs in a single process, prints the result to stdout.
 *
 * Usage:
 *   node scripts/gen-one-keypair.js [suffix] [caseSensitive]
 *
 * Examples:
 *   node scripts/gen-one-keypair.js HoDL true
 *   node scripts/gen-one-keypair.js pump true
 */

"use strict";

const crypto = require("crypto");
const bs58raw = require("bs58");
const bs58 = bs58raw.default || bs58raw;

const suffix = process.argv[2] || "HoDL";
const caseSensitive = process.argv[3] !== "false";
const suffixCheck = caseSensitive ? suffix : suffix.toLowerCase();

console.log(`Grinding for suffix: "${suffix}" (caseSensitive=${caseSensitive})`);
console.log("Press Ctrl+C to cancel.\n");

let attempts = 0;
const start = Date.now();

while (true) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const pub32 = pubDer.slice(-32);
  const b58 = bs58.encode(pub32);

  const tail = caseSensitive ? b58.slice(-suffix.length) : b58.slice(-suffix.length).toLowerCase();

  attempts++;

  if (attempts % 100_000 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const rate = Math.round(attempts / ((Date.now() - start) / 1000));
    process.stdout.write(`\r  ${attempts.toLocaleString()} attempts, ${rate.toLocaleString()}/s, ${elapsed}s elapsed...`);
  }

  if (tail === suffixCheck) {
    const privDer = privateKey.export({ type: "pkcs8", format: "der" });
    const seed = privDer.slice(-32);
    const fullSecret = Buffer.concat([seed, pub32]);

    // Encode as base58 (same format as Solana CLI / Phantom import)
    const secretB58 = bs58.encode(fullSecret);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n\nFound after ${attempts.toLocaleString()} attempts in ${elapsed}s!\n`);
    console.log(`  Public Key : ${b58}`);
    console.log(`  Secret Key : ${secretB58}`);
    console.log(`\n  ⚠  Save the secret key somewhere safe - it will not be shown again.`);
    process.exit(0);
  }
}

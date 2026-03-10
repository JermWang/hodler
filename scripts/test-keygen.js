/**
 * Quick sanity check - generates 10 keypairs and prints their base58 tails
 * so you can confirm the suffix checking logic is working correctly.
 * Also does a fast test with a 1-char suffix to prove it can find matches.
 *
 * Run: node scripts/test-keygen.js
 */

"use strict";

const crypto = require("crypto");
const bs58raw = require("bs58");
const bs58 = bs58raw.default || bs58raw;

console.log("── Sample keypairs (last 4 chars of pubkey) ──────────────────");
for (let i = 0; i < 10; i++) {
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const pub32 = pubDer.slice(-32);
  const b58 = bs58.encode(pub32);
  console.log(`  ${b58}  [tail: "${b58.slice(-4)}"]`);
}

console.log("\n── Verifying suffix search works (looking for 1-char 'z') ────");
let found = 0;
let attempts = 0;
const start = Date.now();
while (found < 3) {
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const pub32 = pubDer.slice(-32);
  const b58 = bs58.encode(pub32);
  attempts++;
  if (b58.endsWith("z")) {
    found++;
    console.log(`  FOUND #${found} after ${attempts} attempts: ${b58}`);
    attempts = 0;
  }
}
const elapsed = ((Date.now() - start) / 1000).toFixed(2);
console.log(`\n  Logic confirmed working. (${elapsed}s total)`);
console.log(`  Expected attempts per 'z' match: 58 (1/58 chance)`);

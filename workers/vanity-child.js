/**
 * Vanity keypair generation child process (plain JS for fork() compatibility).
 * Spawned by vanity-pool.ts via child_process.fork().
 * Uses Node.js native crypto for ed25519 (~18x faster than pure JS tweetnacl).
 */

"use strict";

const crypto = require("crypto");
const bs58raw = require("bs58");
const bs58 = bs58raw.default || bs58raw;

let running = false;
let suffix = "HODL";
let caseSensitive = true;

process.on("message", (msg) => {
  if (msg && msg.type === "start") {
    suffix = String(msg.suffix || "HODL");
    caseSensitive = msg.caseSensitive !== false;
    running = true;
    grind();
  } else if (msg && msg.type === "stop") {
    running = false;
    process.exit(0);
  }
});

function send(obj) {
  try {
    if (process.send) process.send(obj);
  } catch (_) {}
}

function grind() {
  const suffixCheck = caseSensitive ? suffix : suffix.toLowerCase();
  const suffixLen = suffix.length;
  const BATCH = 500;
  let totalAttempts = 0;

  function batch() {
    if (!running) return;

    for (let i = 0; i < BATCH; i++) {
      const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
      const pubDer = publicKey.export({ type: "spki", format: "der" });
      const pub32 = pubDer.slice(-32);
      const b58 = bs58.encode(pub32);

      const tail = caseSensitive
        ? b58.slice(-suffixLen)
        : b58.slice(-suffixLen).toLowerCase();

      if (tail === suffixCheck) {
        const privDer = privateKey.export({ type: "pkcs8", format: "der" });
        const seed = privDer.slice(-32);
        const fullSecret = Buffer.concat([seed, pub32]);

        send({
          type: "found",
          publicKey: b58,
          secretKey: Array.from(fullSecret),
          attempts: totalAttempts + i + 1,
        });
      }
    }

    totalAttempts += BATCH;

    if (totalAttempts % 50000 === 0) {
      send({ type: "progress", attempts: totalAttempts });
    }

    setImmediate(batch);
  }

  batch();
}

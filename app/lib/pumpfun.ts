import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

import { sendAndConfirm, confirmSignatureViaRpc, getServerCommitment, withRetry } from "./rpc";
import { keypairFromBase58Secret, getConnection } from "./solana";
import { privySignSolanaTransaction } from "./privy";
import { generateVanityKeypairAsync, getPumpVanityCache, warmPumpVanityCache } from "./vanityKeypair";

const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const MAYHEM_PROGRAM_ID = new PublicKey("MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e");
const FEE_PROGRAM_ID = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");

const CREATE_V2_DISCRIMINATOR = Buffer.from([214, 144, 76, 236, 95, 139, 49, 180]);
const EXTEND_ACCOUNT_DISCRIMINATOR = Buffer.from([234, 102, 194, 203, 150, 72, 62, 229]);
const BUY_EXACT_SOL_IN_DISCRIMINATOR = Buffer.from([56, 252, 116, 8, 158, 223, 205, 95]);

const ATA_CREATE_IDEMPOTENT = Buffer.from([1]);

const MINT_AUTHORITY_SEED = Buffer.from("mint-authority");
const GLOBAL_SEED = Buffer.from("global");
const BONDING_CURVE_SEED = Buffer.from("bonding-curve");
const GLOBAL_VOLUME_ACCUMULATOR_SEED = Buffer.from("global_volume_accumulator");
const USER_VOLUME_ACCUMULATOR_SEED = Buffer.from("user_volume_accumulator");

const MAYHEM_GLOBAL_PARAMS_SEED = Buffer.from("global-params");
const MAYHEM_SOL_VAULT_SEED = Buffer.from("sol-vault");
const MAYHEM_STATE_SEED = Buffer.from("mayhem-state");

const FEE_CONFIG_SEED = Buffer.from("fee_config");
const FEE_CONFIG_ID_SEED = Buffer.from([
  1, 86, 224, 246, 147, 102, 90, 207, 68, 219, 21, 104, 191, 23, 91, 170, 81, 137, 203, 151, 245, 210, 255, 59, 101, 93, 43, 182, 253, 109, 24, 176,
]);

const COLLECT_CREATOR_FEE_DISCRIMINATOR = Buffer.from([20, 22, 86, 123, 198, 28, 219, 132]);
const CREATOR_VAULT_SEED = Buffer.from("creator-vault");
const EVENT_AUTHORITY_SEED = Buffer.from("__event_authority");

const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const VANITY_PREWARM_COUNT = Number(process.env.PUMPFUN_VANITY_PREWARM_COUNT ?? 3);
// Only warm cache at runtime, not during build (NEXT_PHASE is set during build)
const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";
if (typeof window === "undefined" && !isNextBuild) {
  warmPumpVanityCache(VANITY_PREWARM_COUNT);
}

function getFeePayerKeypair(): Keypair {
  const secret = process.env.ESCROW_FEE_PAYER_SECRET_KEY;
  if (!secret) {
    throw new Error("ESCROW_FEE_PAYER_SECRET_KEY is required for Pump.fun claims");
  }
  return keypairFromBase58Secret(secret);
}

export function getPumpProgramId(): PublicKey {
  return PUMP_PROGRAM_ID;
}

export function getPumpEventAuthorityPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([EVENT_AUTHORITY_SEED], PUMP_PROGRAM_ID);
  return pda;
}

export function getPumpGlobalPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([GLOBAL_SEED], PUMP_PROGRAM_ID);
  return pda;
}

export function getPumpMintAuthorityPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([MINT_AUTHORITY_SEED], PUMP_PROGRAM_ID);
  return pda;
}

export function getBondingCurvePda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([BONDING_CURVE_SEED, mint.toBuffer()], PUMP_PROGRAM_ID);
  return pda;
}

export function getGlobalVolumeAccumulatorPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([GLOBAL_VOLUME_ACCUMULATOR_SEED], PUMP_PROGRAM_ID);
  return pda;
}

export function getUserVolumeAccumulatorPda(user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([USER_VOLUME_ACCUMULATOR_SEED, user.toBuffer()], PUMP_PROGRAM_ID);
  return pda;
}

export function getMayhemGlobalParamsPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([MAYHEM_GLOBAL_PARAMS_SEED], MAYHEM_PROGRAM_ID);
  return pda;
}

export function getMayhemSolVaultPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([MAYHEM_SOL_VAULT_SEED], MAYHEM_PROGRAM_ID);
  return pda;
}

export function getMayhemStatePda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([MAYHEM_STATE_SEED, mint.toBuffer()], MAYHEM_PROGRAM_ID);
  return pda;
}

export function getFeeConfigPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([FEE_CONFIG_SEED, FEE_CONFIG_ID_SEED], FEE_PROGRAM_ID);
  return pda;
}

export function getAssociatedTokenAddress(input: { owner: PublicKey; mint: PublicKey; tokenProgram?: PublicKey }): PublicKey {
  const tokenProgram = input.tokenProgram ?? TOKEN_2022_PROGRAM_ID;
  const [pda] = PublicKey.findProgramAddressSync(
    [input.owner.toBuffer(), tokenProgram.toBuffer(), input.mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return pda;
}

function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
  return b;
}

function toU8(part: Uint8Array | Buffer): Uint8Array {
  // Avoid TS incompatibilities between Buffer's ArrayBufferLike and Uint8Array's ArrayBuffer.
  // Copying is fine here since instruction data sizes are small.
  return Uint8Array.from(part);
}

function concatBytes(parts: readonly Uint8Array[]): Buffer {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = Buffer.alloc(total);

  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }

  return out;
}

function borshString(s: string): Buffer {
  const bytes = Buffer.from(String(s ?? ""), "utf8");
  return concatBytes([toU8(u32le(bytes.length)), toU8(bytes)]);
}

function borshOptionBool(v: boolean): Buffer {
  return Buffer.from([1, v ? 1 : 0]);
}

function validateVanitySuffix(raw: string): string {
  const suffix = String(raw ?? "").trim();
  if (!suffix) throw new Error("vanitySuffix is required when useVanity is true");
  if (suffix.length > 8) throw new Error("vanitySuffix must be 1-8 characters");
  for (const char of suffix) {
    if (!BASE58_CHARS.includes(char)) {
      throw new Error(`vanitySuffix contains invalid character '${char}'`);
    }
  }
  return suffix;
}

export function buildCreateV2Instruction(input: {
  mint: PublicKey;
  user: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  creator: PublicKey;
  isMayhemMode?: boolean;
}): {
  ix: TransactionInstruction;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
} {
  const mintAuthority = getPumpMintAuthorityPda();
  const bondingCurve = getBondingCurvePda(input.mint);
  const associatedBondingCurve = getAssociatedTokenAddress({ owner: bondingCurve, mint: input.mint, tokenProgram: TOKEN_2022_PROGRAM_ID });
  const global = getPumpGlobalPda();
  const globalParams = getMayhemGlobalParamsPda();
  const solVault = getMayhemSolVaultPda();
  const mayhemState = getMayhemStatePda(input.mint);
  const mayhemTokenVault = getAssociatedTokenAddress({ owner: solVault, mint: input.mint, tokenProgram: TOKEN_2022_PROGRAM_ID });
  const eventAuthority = getPumpEventAuthorityPda();

  const data = concatBytes(
    [
      CREATE_V2_DISCRIMINATOR,
      borshString(input.name),
      borshString(input.symbol),
      borshString(input.uri),
      input.creator.toBuffer(),
      Buffer.from([input.isMayhemMode ? 1 : 0]),
    ].map(toU8)
  );

  const ix = new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys: [
      { pubkey: input.mint, isSigner: true, isWritable: true },
      { pubkey: mintAuthority, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: global, isSigner: false, isWritable: false },
      { pubkey: input.user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MAYHEM_PROGRAM_ID, isSigner: false, isWritable: true },
      { pubkey: globalParams, isSigner: false, isWritable: false },
      { pubkey: solVault, isSigner: false, isWritable: true },
      { pubkey: mayhemState, isSigner: false, isWritable: true },
      { pubkey: mayhemTokenVault, isSigner: false, isWritable: true },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  return { ix, bondingCurve, associatedBondingCurve };
}

export function buildExtendAccountInstruction(input: { account: PublicKey; user: PublicKey }): TransactionInstruction {
  const eventAuthority = getPumpEventAuthorityPda();
  return new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys: [
      { pubkey: input.account, isSigner: false, isWritable: true },
      { pubkey: input.user, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: EXTEND_ACCOUNT_DISCRIMINATOR,
  });
}

export function buildCreateAssociatedTokenAccountIdempotentInstruction(input: {
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  tokenProgram?: PublicKey;
}): { ix: TransactionInstruction; ata: PublicKey } {
  const tokenProgram = input.tokenProgram ?? TOKEN_2022_PROGRAM_ID;
  const ata = getAssociatedTokenAddress({ owner: input.owner, mint: input.mint, tokenProgram });
  const ix = new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: input.owner, isSigner: false, isWritable: false },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: ATA_CREATE_IDEMPOTENT,
  });
  return { ix, ata };
}

async function getGlobalFeeRecipient(input: { connection: Connection }): Promise<PublicKey> {
  const global = getPumpGlobalPda();
  const acct = await input.connection.getAccountInfo(global, "confirmed");
  if (!acct?.data || acct.data.length < 8 + 1 + 32 + 32) {
    throw new Error("Failed to read pump.fun global state");
  }
  const feeRecipientBytes = acct.data.subarray(8 + 1 + 32, 8 + 1 + 32 + 32);
  return new PublicKey(feeRecipientBytes);
}

export function buildBuyExactSolInInstruction(input: {
  user: PublicKey;
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  associatedUser: PublicKey;
  feeRecipient: PublicKey;
  creator: PublicKey;
  spendableSolInLamports: bigint;
  minTokensOut: bigint;
  trackVolume?: boolean;
}): TransactionInstruction {
  const global = getPumpGlobalPda();
  const eventAuthority = getPumpEventAuthorityPda();
  const creatorVault = getCreatorVaultPda(input.creator);
  const globalVolumeAccumulator = getGlobalVolumeAccumulatorPda();
  const userVolumeAccumulator = getUserVolumeAccumulatorPda(input.user);
  const feeConfig = getFeeConfigPda();

  const data = concatBytes(
    [
      BUY_EXACT_SOL_IN_DISCRIMINATOR,
      u64le(BigInt(input.spendableSolInLamports)),
      u64le(BigInt(input.minTokensOut)),
      borshOptionBool(input.trackVolume === false ? false : true),
    ].map(toU8)
  );

  return new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys: [
      { pubkey: global, isSigner: false, isWritable: false },
      { pubkey: input.feeRecipient, isSigner: false, isWritable: true },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: input.bondingCurve, isSigner: false, isWritable: true },
      { pubkey: input.associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: input.associatedUser, isSigner: false, isWritable: true },
      { pubkey: input.user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: creatorVault, isSigner: false, isWritable: true },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: globalVolumeAccumulator, isSigner: false, isWritable: false },
      { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
      { pubkey: feeConfig, isSigner: false, isWritable: false },
      { pubkey: FEE_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function buildUnsignedPumpfunCreateV2Tx(input: {
  connection: Connection;
  user: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  creator: PublicKey;
  isMayhemMode?: boolean;
  spendableSolInLamports: bigint;
  minTokensOut?: bigint;
  computeUnitLimit?: number;
  computeUnitPriceMicroLamports?: number;
}): Promise<{ tx: Transaction; bondingCurve: PublicKey; associatedBondingCurve: PublicKey; associatedUser: PublicKey; feeRecipient: PublicKey }> {
  const feeRecipient = await getGlobalFeeRecipient({ connection: input.connection });

  const { ix: createIx, bondingCurve, associatedBondingCurve } = buildCreateV2Instruction({
    mint: input.mint,
    user: input.user,
    name: input.name,
    symbol: input.symbol,
    uri: input.uri,
    creator: input.creator,
    isMayhemMode: input.isMayhemMode,
  });

  const extendIx = buildExtendAccountInstruction({ account: bondingCurve, user: input.user });

  const { ix: createAtaIx, ata: associatedUser } = buildCreateAssociatedTokenAccountIdempotentInstruction({
    payer: input.user,
    owner: input.user,
    mint: input.mint,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });

  const spendable = BigInt(input.spendableSolInLamports);
  const buyIx =
    spendable > 0n
      ? buildBuyExactSolInInstruction({
          user: input.user,
          mint: input.mint,
          bondingCurve,
          associatedBondingCurve,
          associatedUser,
          feeRecipient,
          creator: input.creator,
          spendableSolInLamports: spendable,
          minTokensOut: BigInt(input.minTokensOut ?? 0),
          trackVolume: true,
        })
      : null;

  const tx = new Transaction();
  tx.feePayer = input.user;

  const cuLimit = Math.max(50_000, Math.min(1_400_000, Number(input.computeUnitLimit ?? 199_613)));
  const cuPrice = Math.max(0, Math.min(50_000_000, Number(input.computeUnitPriceMicroLamports ?? 936_761)));

  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }));
  tx.add(createIx);
  tx.add(extendIx);
  tx.add(createAtaIx);
  if (buyIx) tx.add(buyIx);

  const { blockhash, lastValidBlockHeight } = await input.connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  return { tx, bondingCurve, associatedBondingCurve, associatedUser, feeRecipient };
}

export async function buildUnsignedPumpfunBuyTx(input: {
  connection: Connection;
  user: PublicKey;
  mint: PublicKey;
  creator: PublicKey;
  spendableSolInLamports: bigint;
  minTokensOut?: bigint;
  computeUnitLimit?: number;
  computeUnitPriceMicroLamports?: number;
}): Promise<{ tx: Transaction; bondingCurve: PublicKey; associatedBondingCurve: PublicKey; associatedUser: PublicKey; feeRecipient: PublicKey }> {
  const feeRecipient = await getGlobalFeeRecipient({ connection: input.connection });
  const bondingCurve = getBondingCurvePda(input.mint);
  const associatedBondingCurve = getAssociatedTokenAddress({ owner: bondingCurve, mint: input.mint, tokenProgram: TOKEN_2022_PROGRAM_ID });
  const associatedUser = getAssociatedTokenAddress({ owner: input.user, mint: input.mint, tokenProgram: TOKEN_2022_PROGRAM_ID });

  const { ix: createAtaIx } = buildCreateAssociatedTokenAccountIdempotentInstruction({
    payer: input.user,
    owner: input.user,
    mint: input.mint,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });

  const buyIx = buildBuyExactSolInInstruction({
    user: input.user,
    mint: input.mint,
    bondingCurve,
    associatedBondingCurve,
    associatedUser,
    feeRecipient,
    creator: input.creator,
    spendableSolInLamports: BigInt(input.spendableSolInLamports),
    minTokensOut: BigInt(input.minTokensOut ?? 0),
    trackVolume: true,
  });

  const tx = new Transaction();
  tx.feePayer = input.user;

  const cuLimit = Math.max(50_000, Math.min(1_400_000, Number(input.computeUnitLimit ?? 199_613)));
  const cuPrice = Math.max(0, Math.min(50_000_000, Number(input.computeUnitPriceMicroLamports ?? 936_761)));

  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }));
  tx.add(createAtaIx);
  tx.add(buyIx);

  const { blockhash, lastValidBlockHeight } = await input.connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  return { tx, bondingCurve, associatedBondingCurve, associatedUser, feeRecipient };
}

export function getCreatorVaultPda(creator: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([CREATOR_VAULT_SEED, creator.toBuffer()], PUMP_PROGRAM_ID);
  return pda;
}

export async function getClaimableCreatorFeeLamports(input: {
  connection: Connection;
  creator: PublicKey;
}): Promise<{ creatorVault: PublicKey; vaultBalanceLamports: number; rentExemptMinLamports: number; claimableLamports: number }> {
  const { connection, creator } = input;
  const creatorVault = getCreatorVaultPda(creator);

  const [vaultBalanceLamports, rentExemptMinLamports] = await Promise.all([
    connection.getBalance(creatorVault),
    connection.getMinimumBalanceForRentExemption(0),
  ]);

  const claimableLamports = Math.max(0, vaultBalanceLamports - rentExemptMinLamports);

  return { creatorVault, vaultBalanceLamports, rentExemptMinLamports, claimableLamports };
}

export function buildCollectCreatorFeeInstruction(input: { creator: PublicKey }): { ix: TransactionInstruction; creatorVault: PublicKey } {
  const creatorVault = getCreatorVaultPda(input.creator);
  const eventAuthority = getPumpEventAuthorityPda();

  const ix = new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys: [
      { pubkey: input.creator, isSigner: false, isWritable: true },
      { pubkey: creatorVault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: COLLECT_CREATOR_FEE_DISCRIMINATOR,
  });

  return { ix, creatorVault };
}

export async function buildUnsignedClaimCreatorFeesTx(input: {
  connection: Connection;
  creator: PublicKey;
}): Promise<{ tx: Transaction; creatorVault: PublicKey; claimableLamports: number; rentExemptMinLamports: number; vaultBalanceLamports: number }> {
  const { connection, creator } = input;

  const claimable = await getClaimableCreatorFeeLamports({ connection, creator });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("processed");
  const { ix, creatorVault } = buildCollectCreatorFeeInstruction({ creator });

  const tx = new Transaction();
  tx.feePayer = creator;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.add(ix);

  return {
    tx,
    creatorVault,
    claimableLamports: claimable.claimableLamports,
    rentExemptMinLamports: claimable.rentExemptMinLamports,
    vaultBalanceLamports: claimable.vaultBalanceLamports,
  };
}

export async function claimCreatorFees(input: {
  connection: Connection;
  creator: PublicKey;
}): Promise<{ signature: string; claimableLamports: number; creatorVault: PublicKey }> {
  const { connection, creator } = input;

  const { creatorVault, claimableLamports } = await getClaimableCreatorFeeLamports({ connection, creator });
  if (claimableLamports <= 0) {
    throw new Error("No claimable creator fees");
  }

  const feePayer = getFeePayerKeypair();
  const eventAuthority = getPumpEventAuthorityPda();

  const ix = new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys: [
      { pubkey: creator, isSigner: false, isWritable: true },
      { pubkey: creatorVault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: COLLECT_CREATOR_FEE_DISCRIMINATOR,
  });

  const tx = new Transaction();
  tx.feePayer = feePayer.publicKey;
  tx.add(ix);

  const signature = await sendAndConfirm({ connection, tx, signers: [feePayer] });
  return { signature, claimableLamports, creatorVault };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pump.fun Token Launch (with Privy signing)
// ─────────────────────────────────────────────────────────────────────────────

export interface PumpfunLaunchParams {
  name: string;
  symbol: string;
  metadataUri: string;
  initialBuyLamports: number;
  privyWalletId: string;
  launchWalletPubkey: PublicKey;
  isMayhemMode?: boolean;
  useVanity?: boolean;
  vanitySuffix?: string;
  vanityMaxAttempts?: number;
  mintKeypair?: Keypair;
}

export interface PumpfunLaunchResult {
  ok: true;
  tokenMint: string;
  metadataUri: string;
  launchSignature: string;
  bondingCurve: string;
  creatorVault: string;
  vanityGenerationMs?: number;
  vanitySource?: "cache" | "generated" | "random" | "provided";
}

/**
 * Launch a token via Pump.fun using Privy-managed wallet signing.
 * 
 * This creates a token on Pump.fun's bonding curve with creator fees
 * going to the launch wallet (managed by AmpliFi for campaigns).
 * 
 * Note: Metadata must be uploaded separately before calling this function.
 * Use the Pump.fun IPFS endpoint or your own metadata hosting.
 */
export async function launchTokenViaPumpfun(params: PumpfunLaunchParams): Promise<PumpfunLaunchResult> {
  const connection = getConnection();
  const launchWallet = params.launchWalletPubkey;

  const useVanity = params.useVanity ?? false;
  const vanitySuffix = String(params.vanitySuffix ?? "pump").trim();
  const vanityMaxAttempts = Math.max(10_000, Math.min(100_000_000, Number(params.vanityMaxAttempts ?? 50_000_000)));

  // Generate a new mint keypair for the token (optionally vanity)
  let vanityGenerationMs: number | undefined;
  let vanitySource: "cache" | "generated" | "random" | "provided" | undefined;

  let mintKeypair = params.mintKeypair ?? null;
  if (mintKeypair) {
    vanitySource = "provided";
  } else {
    if (useVanity) {
      const suffix = validateVanitySuffix(vanitySuffix || "pump");
      const start = Date.now();
      if (suffix.toLowerCase() === "pump") {
        const cache = getPumpVanityCache();
        const fromCache = cache.size > 0;
        mintKeypair = await cache.get();
        vanityGenerationMs = Date.now() - start;
        vanitySource = fromCache ? "cache" : "generated";
        // Trigger background replenishment after consuming a keypair
        warmPumpVanityCache(3);
      } else {
        const vanityKeypair = await generateVanityKeypairAsync(suffix, vanityMaxAttempts);
        vanityGenerationMs = Date.now() - start;
        if (!vanityKeypair) {
          throw new Error(`Failed to generate vanity mint with suffix "${suffix}" after ${vanityMaxAttempts} attempts`);
        }
        mintKeypair = vanityKeypair;
        vanitySource = "generated";
      }
    } else {
      mintKeypair = Keypair.generate();
      vanitySource = "random";
    }
  }

  const mint = mintKeypair.publicKey;

  // Build the create + buy transaction
  const { tx, bondingCurve } = await buildUnsignedPumpfunCreateV2Tx({
    connection,
    user: launchWallet,
    mint,
    name: params.name,
    symbol: params.symbol.toUpperCase().replace("$", ""),
    uri: params.metadataUri,
    creator: launchWallet,
    isMayhemMode: params.isMayhemMode ?? false,
    spendableSolInLamports: BigInt(params.initialBuyLamports),
    minTokensOut: 0n,
    computeUnitLimit: 300_000,
    computeUnitPriceMicroLamports: 100_000,
  });

  // The mint keypair must sign the transaction
  tx.partialSign(mintKeypair);

  const finality = getServerCommitment();

  let signature = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const latest = await withRetry(() => connection.getLatestBlockhash("processed"));
    tx.recentBlockhash = latest.blockhash;
    tx.lastValidBlockHeight = latest.lastValidBlockHeight;
    tx.partialSign(mintKeypair);

    try {
      const txBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
      const signed = await privySignSolanaTransaction({
        walletId: params.privyWalletId,
        transactionBase64: txBase64,
      });

      const raw = Buffer.from(signed.signedTransactionBase64, "base64");
      signature = await withRetry(() =>
        connection.sendRawTransaction(raw, {
          skipPreflight: false,
          preflightCommitment: "processed",
          maxRetries: 3,
        })
      );
      break;
    } catch (sendErr) {
      const msg = String((sendErr as any)?.message ?? sendErr ?? "");
      const lower = msg.toLowerCase();
      const retryable =
        (lower.includes("blockhash") && (lower.includes("expired") || lower.includes("not found"))) ||
        lower.includes("block height exceeded") ||
        lower.includes("blockheight exceeded");
      if (!retryable || attempt === 3) throw sendErr;
    }
  }

  await confirmSignatureViaRpc(connection, signature, finality);

  const creatorVault = getCreatorVaultPda(launchWallet);

  return {
    ok: true,
    tokenMint: mint.toBase58(),
    metadataUri: params.metadataUri,
    launchSignature: signature,
    bondingCurve: bondingCurve.toBase58(),
    creatorVault: creatorVault.toBase58(),
    vanityGenerationMs,
    vanitySource,
  };
}

/**
 * Upload token metadata to Pump.fun's IPFS endpoint.
 * Returns the metadata URI to use in the launch.
 */
export async function uploadPumpfunMetadata(params: {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  twitterUrl?: string;
  websiteUrl?: string;
  telegramUrl?: string;
}): Promise<{ metadataUri: string }> {
  const metadataFormData = new FormData();
  metadataFormData.append("name", params.name);
  metadataFormData.append("symbol", params.symbol.toUpperCase().replace("$", ""));
  metadataFormData.append("description", params.description);
  metadataFormData.append("showName", "true");
  if (params.websiteUrl) metadataFormData.append("website", params.websiteUrl);
  if (params.twitterUrl) metadataFormData.append("twitter", params.twitterUrl);
  if (params.telegramUrl) metadataFormData.append("telegram", params.telegramUrl);

  const imageResponse = await fetch(params.imageUrl);
  if (!imageResponse.ok) {
    throw new Error("Failed to fetch token image");
  }
  const imageBlob = await imageResponse.blob();
  metadataFormData.append("file", imageBlob, "token.png");

  const response = await fetch("https://pump.fun/api/ipfs", {
    method: "POST",
    body: metadataFormData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to upload metadata to Pump.fun: ${response.status} ${text}`);
  }

  const json = await response.json();
  const metadataUri = String(json?.metadataUri ?? json?.uri ?? "").trim();

  if (!metadataUri) {
    throw new Error("Pump.fun did not return a metadata URI");
  }

  return { metadataUri };
}

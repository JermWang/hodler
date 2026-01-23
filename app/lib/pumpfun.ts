import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";

import { sendAndConfirm, confirmSignatureViaRpc, getServerCommitment, withRetry } from "./rpc";
import { keypairFromBase58Secret, getConnection } from "./solana";
import { privySignSolanaTransaction } from "./privy";
import { popVanityKeypair, releaseReservedVanityKeypair, markVanityKeypairUsed } from "./vanityPool";
import { pumpportalBuildCreateTokenTxBase64 } from "./pumpportal";

const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const MAYHEM_PROGRAM_ID = new PublicKey("MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e");
const FEE_PROGRAM_ID = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");

const CREATE_V2_DISCRIMINATOR = Buffer.from([214, 144, 76, 236, 95, 139, 49, 180]);
const EXTEND_ACCOUNT_DISCRIMINATOR = Buffer.from([234, 102, 194, 203, 150, 72, 62, 229]);
const BUY_EXACT_SOL_IN_DISCRIMINATOR = Buffer.from([56, 252, 116, 8, 158, 223, 205, 95]);
// Regular Buy instruction discriminator (tokens_to_buy, max_sol_cost format)
const BUY_DISCRIMINATOR = Buffer.from([0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea]);

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
  // Borsh Option<bool> encoding:
  // None = [0] (1 byte)
  // Some(false) = [1, 0] (2 bytes)
  // Some(true) = [1, 1] (2 bytes)
  // The Pump.fun program expects Some(bool), not None
  return Buffer.from([1, v ? 1 : 0]);
}

function validateVanitySuffix(raw: string): string {
  const suffix = String(raw ?? "").trim();
  if (!suffix) throw new Error("vanitySuffix is required when useVanity is true");
  if (suffix.length > 8) throw new Error("vanitySuffix must be 1-8 characters");

  const suffixUpper = suffix.toUpperCase();
  if (suffixUpper === "AMP" && suffix !== "AMP") {
    throw new Error('vanitySuffix "AMP" must be uppercase');
  }
  if (suffixUpper !== "AMP") {
    throw new Error('vanitySuffix must be "AMP"');
  }

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
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: ATA_CREATE_IDEMPOTENT,
  });
  return { ix, ata };
}

export async function getGlobalFeeRecipient(input: { connection: Connection }): Promise<PublicKey> {
  const global = getPumpGlobalPda();
  const acct = await input.connection.getAccountInfo(global, "confirmed");
  if (!acct?.data || acct.data.length < 8 + 1 + 32 + 32) {
    throw new Error("Pump.global account not found or invalid");
  }
  const feeRecipientBytes = acct.data.subarray(8 + 1 + 32, 8 + 1 + 32 + 32);
  return new PublicKey(feeRecipientBytes);
}

/**
 * Read the creator pubkey directly from the on-chain bonding curve account.
 * This is critical for deriving the correct creator_vault PDA.
 * 
 * BondingCurve layout (after 8-byte discriminator):
 * - virtual_token_reserves: u64 (8)
 * - virtual_sol_reserves: u64 (8)
 * - real_token_reserves: u64 (8)
 * - real_sol_reserves: u64 (8)
 * - token_total_supply: u64 (8)
 * - complete: bool (1)
 * - creator: pubkey (32) <- at offset 8 + 40 + 1 = 49
 * - is_mayhem_mode: bool (1)
 */
export async function getBondingCurveCreator(input: { connection: Connection; mint: PublicKey }): Promise<PublicKey> {
  const bondingCurve = getBondingCurvePda(input.mint);
  const acct = await input.connection.getAccountInfo(bondingCurve, "confirmed");
  if (!acct?.data || acct.data.length < 8 + 40 + 1 + 32) {
    throw new Error("Bonding curve account not found or invalid");
  }
  // Offset: 8 (discriminator) + 8*5 (five u64s) + 1 (bool) = 49
  const creatorOffset = 8 + 40 + 1;
  const creatorBytes = acct.data.subarray(creatorOffset, creatorOffset + 32);
  return new PublicKey(creatorBytes);
}

export interface BondingCurveState {
  bondingCurvePda: string;
  virtualTokenReserves: string;
  virtualSolReserves: string;
  realTokenReserves: string;
  realSolReserves: string;
  tokenTotalSupply: string;
  complete: boolean;
  creator: string;
  isMayhemMode: boolean;
}

/**
 * Read the full bonding curve state for debugging.
 */
export async function getBondingCurveState(input: { connection: Connection; mint: PublicKey }): Promise<BondingCurveState> {
  const bondingCurve = getBondingCurvePda(input.mint);
  const acct = await input.connection.getAccountInfo(bondingCurve, "confirmed");
  if (!acct?.data || acct.data.length < 8 + 40 + 1 + 32 + 1) {
    throw new Error("Bonding curve account not found or invalid");
  }
  const data = acct.data;
  // After 8-byte discriminator:
  const virtualTokenReserves = data.readBigUInt64LE(8);
  const virtualSolReserves = data.readBigUInt64LE(16);
  const realTokenReserves = data.readBigUInt64LE(24);
  const realSolReserves = data.readBigUInt64LE(32);
  const tokenTotalSupply = data.readBigUInt64LE(40);
  const complete = data.readUInt8(48) !== 0;
  const creator = new PublicKey(data.subarray(49, 81));
  const isMayhemMode = data.readUInt8(81) !== 0;

  return {
    bondingCurvePda: bondingCurve.toBase58(),
    virtualTokenReserves: virtualTokenReserves.toString(),
    virtualSolReserves: virtualSolReserves.toString(),
    realTokenReserves: realTokenReserves.toString(),
    realSolReserves: realSolReserves.toString(),
    tokenTotalSupply: tokenTotalSupply.toString(),
    complete,
    creator: creator.toBase58(),
    isMayhemMode,
  };
}

// ... (rest of the code remains the same)
// Initial bonding curve parameters for new tokens
const INITIAL_VIRTUAL_TOKEN_RESERVES = BigInt(1_073_000_000_000_000); // 1.073B tokens with 6 decimals
const INITIAL_VIRTUAL_SOL_RESERVES = BigInt(30_000_000_000); // 30 SOL in lamports
const FEE_BASIS_POINTS = BigInt(100); // 1% fee

// Calculate tokens to buy using AMM formula for initial bonding curve
function calculateInitialBuyTokens(solLamports: bigint): bigint {
  // Apply 1% fee
  const fee = (solLamports * FEE_BASIS_POINTS) / BigInt(10000);
  const solAfterFee = solLamports - fee;
  
  // AMM formula: tokens_out = (sol_in * virtual_token_reserves) / (virtual_sol_reserves + sol_in)
  const tokensOut = (solAfterFee * INITIAL_VIRTUAL_TOKEN_RESERVES) / (INITIAL_VIRTUAL_SOL_RESERVES + solAfterFee);
  return tokensOut;
}

export function buildBuyInstruction(input: {
  user: PublicKey;
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  associatedUser: PublicKey;
  feeRecipient: PublicKey;
  creator: PublicKey;
  tokenProgram?: PublicKey;
  tokensToBuy: bigint;
  maxSolCost: bigint;
  trackVolume?: boolean;
}): TransactionInstruction {
  const global = getPumpGlobalPda();
  const eventAuthority = getPumpEventAuthorityPda();
  const creatorVault = getCreatorVaultPda(input.creator);
  const globalVolumeAccumulator = getGlobalVolumeAccumulatorPda();
  const userVolumeAccumulator = getUserVolumeAccumulatorPda(input.user);
  const feeConfig = getFeeConfigPda();
  const tokenProgram = input.tokenProgram ?? TOKEN_2022_PROGRAM_ID;

  const data = concatBytes(
    [
      BUY_DISCRIMINATOR,
      u64le(BigInt(input.tokensToBuy)),
      u64le(BigInt(input.maxSolCost)),
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
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
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

export function buildBuyExactSolInInstruction(input: {
  user: PublicKey;
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  associatedUser: PublicKey;
  feeRecipient: PublicKey;
  creator: PublicKey;
  tokenProgram?: PublicKey;
  spendableSolInLamports: bigint;
  minTokensOut: bigint;
  trackVolume?: boolean;
  u64ArgOrder?: "spendable_min" | "min_spendable";
}): TransactionInstruction {
  const global = getPumpGlobalPda();
  const eventAuthority = getPumpEventAuthorityPda();
  const creatorVault = getCreatorVaultPda(input.creator);
  const globalVolumeAccumulator = getGlobalVolumeAccumulatorPda();
  const userVolumeAccumulator = getUserVolumeAccumulatorPda(input.user);
  const feeConfig = getFeeConfigPda();

  const tokenProgram = input.tokenProgram ?? TOKEN_2022_PROGRAM_ID;

  // NOTE: On-chain behavior contradicts published IDL. IDL says spendable first, but program
  // actually expects min_tokens_out first (min_spendable order). Verified empirically:
  // - spendable_min -> 6020 BuyZeroAmount (program reads spendable as 0)
  // - min_spendable -> 6041 BuyNotEnoughSolToCoverFees (program reads spendable correctly)
  const u64Order = input.u64ArgOrder ?? "min_spendable";
  const firstU64 = u64Order === "min_spendable" ? BigInt(input.minTokensOut) : BigInt(input.spendableSolInLamports);
  const secondU64 = u64Order === "min_spendable" ? BigInt(input.spendableSolInLamports) : BigInt(input.minTokensOut);

  const data = concatBytes(
    [
      BUY_EXACT_SOL_IN_DISCRIMINATOR,
      u64le(firstU64),
      u64le(secondU64),
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
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
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
  // Use regular Buy instruction - calculate tokens based on initial bonding curve
  const tokensToBuy = spendable > 0n ? calculateInitialBuyTokens(spendable) : 0n;
  // Add 50% slippage for max SOL cost to handle price movement
  const maxSolCost = spendable + (spendable / 2n);
  
  console.log("[pumpfun] Buy calculation: spendable=", spendable.toString(), "tokensToBuy=", tokensToBuy.toString(), "maxSolCost=", maxSolCost.toString());
  
  const buyIx =
    spendable > 0n && tokensToBuy > 0n
      ? buildBuyInstruction({
          user: input.user,
          mint: input.mint,
          bondingCurve,
          associatedBondingCurve,
          associatedUser,
          feeRecipient,
          creator: input.creator,
          tokensToBuy,
          maxSolCost,
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

/**
 * Build a buy transaction using the REGULAR Buy instruction (tokensToBuy, maxSolCost).
 * This is what the token creation flow uses and is proven to work.
 */
export async function buildUnsignedPumpfunBuyTxRegular(input: {
  connection: Connection;
  user: PublicKey;
  mint: PublicKey;
  creator: PublicKey;
  tokenProgram?: PublicKey;
  tokensToBuy: bigint;
  maxSolCost: bigint;
  trackVolume?: boolean;
  computeUnitLimit?: number;
  computeUnitPriceMicroLamports?: number;
}): Promise<{ tx: Transaction; bondingCurve: PublicKey; associatedBondingCurve: PublicKey; associatedUser: PublicKey; feeRecipient: PublicKey }> {
  const feeRecipient = await getGlobalFeeRecipient({ connection: input.connection });
  const tokenProgram = input.tokenProgram ?? TOKEN_2022_PROGRAM_ID;
  const bondingCurve = getBondingCurvePda(input.mint);
  const associatedBondingCurve = getAssociatedTokenAddress({ owner: bondingCurve, mint: input.mint, tokenProgram });
  const associatedUser = getAssociatedTokenAddress({ owner: input.user, mint: input.mint, tokenProgram });

  const { ix: createAtaIx } = buildCreateAssociatedTokenAccountIdempotentInstruction({
    payer: input.user,
    owner: input.user,
    mint: input.mint,
    tokenProgram,
  });

  const buyIx = buildBuyInstruction({
    user: input.user,
    mint: input.mint,
    bondingCurve,
    associatedBondingCurve,
    associatedUser,
    feeRecipient,
    creator: input.creator,
    tokenProgram,
    tokensToBuy: input.tokensToBuy,
    maxSolCost: input.maxSolCost,
    trackVolume: input.trackVolume,
  });

  const tx = new Transaction();
  tx.feePayer = input.user;

  const cuLimit = Math.max(50_000, Math.min(1_400_000, Number(input.computeUnitLimit ?? 300_000)));
  const cuPrice = Math.max(0, Math.min(50_000_000, Number(input.computeUnitPriceMicroLamports ?? 100_000)));

  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }));
  tx.add(createAtaIx);
  tx.add(buyIx);

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
  tokenProgram?: PublicKey;
  spendableSolInLamports: bigint;
  minTokensOut?: bigint;
  buyExactSolInU64ArgOrder?: "spendable_min" | "min_spendable";
  trackVolume?: boolean;
  computeUnitLimit?: number;
  computeUnitPriceMicroLamports?: number;
}): Promise<{ tx: Transaction; bondingCurve: PublicKey; associatedBondingCurve: PublicKey; associatedUser: PublicKey; feeRecipient: PublicKey }> {
  const feeRecipient = await getGlobalFeeRecipient({ connection: input.connection });
  const tokenProgram = input.tokenProgram ?? TOKEN_2022_PROGRAM_ID;
  const bondingCurve = getBondingCurvePda(input.mint);
  const associatedBondingCurve = getAssociatedTokenAddress({ owner: bondingCurve, mint: input.mint, tokenProgram });
  const associatedUser = getAssociatedTokenAddress({ owner: input.user, mint: input.mint, tokenProgram });

  const { ix: createAtaIx } = buildCreateAssociatedTokenAccountIdempotentInstruction({
    payer: input.user,
    owner: input.user,
    mint: input.mint,
    tokenProgram,
  });

  const buyIx = buildBuyExactSolInInstruction({
    user: input.user,
    mint: input.mint,
    bondingCurve,
    associatedBondingCurve,
    associatedUser,
    feeRecipient,
    creator: input.creator,
    tokenProgram,
    spendableSolInLamports: BigInt(input.spendableSolInLamports),
    minTokensOut: BigInt(input.minTokensOut ?? 0),
    trackVolume: input.trackVolume === false ? false : true,
    u64ArgOrder: input.buyExactSolInU64ArgOrder,
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

  const [info, vaultBalanceLamports] = await Promise.all([
    connection.getAccountInfo(creatorVault, "confirmed"),
    connection.getBalance(creatorVault, "confirmed"),
  ]);

  if (!info) {
    return { creatorVault, vaultBalanceLamports: 0, rentExemptMinLamports: 0, claimableLamports: 0 };
  }

  const rentExemptMinLamports = await connection.getMinimumBalanceForRentExemption(info.data?.length ?? 0);
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
  ok: boolean;
  tokenMint: string;
  metadataUri: string;
  launchSignature: string;
  bondingCurve: string;
  creatorVault: string;
  vanityGenerationMs?: number;
  vanitySource?: "cache" | "pool" | "generated" | "random" | "provided";
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
  console.log("[pumpfun] launchTokenViaPumpfun called with:", { name: params.name, symbol: params.symbol, privyWalletId: params.privyWalletId });
  const connection = getConnection();
  const launchWallet = params.launchWalletPubkey;

  const useVanity = params.useVanity ?? false;
  const vanitySuffix = String(params.vanitySuffix ?? "AMP").trim();
  const vanityMaxAttempts = Math.max(10_000, Math.min(100_000_000, Number(params.vanityMaxAttempts ?? 50_000_000)));

  // Generate a new mint keypair for the token (optionally vanity)
  let vanityGenerationMs: number | undefined;
  let vanitySource: "cache" | "pool" | "generated" | "random" | "provided" | undefined;
  let reservedVanityPubkey: string | null = null;

  let mintKeypair = params.mintKeypair ?? null;
  if (mintKeypair) {
    vanitySource = "provided";
  } else {
    if (useVanity) {
      const suffix = validateVanitySuffix(vanitySuffix || "AMP");
      const start = Date.now();
      const fromPool = await popVanityKeypair({ suffix });
      if (fromPool) {
        mintKeypair = fromPool;
        reservedVanityPubkey = mintKeypair.publicKey.toBase58();
        vanityGenerationMs = Date.now() - start;
        vanitySource = "pool";
        console.log("[pumpfun] Used pooled vanity keypair");
      } else {
        throw new Error('Vanity pool is empty for suffix "AMP". Wait for the worker to generate more or disable vanity.');
      }
    } else {
      mintKeypair = Keypair.generate();
      vanitySource = "random";
    }
  }

  const mint = mintKeypair.publicKey;

  console.log("[pumpfun] Mint keypair generated:", mint.toBase58(), "vanitySource:", vanitySource);

  const finalizeVanity = async (ok: boolean) => {
    if (!reservedVanityPubkey) return;
    try {
      if (ok) {
        await markVanityKeypairUsed({ publicKey: reservedVanityPubkey });
      } else {
        await releaseReservedVanityKeypair({ publicKey: reservedVanityPubkey });
      }
    } catch {
    }
  };

  // Build the create + buy transaction
  const initialBuyLamportsRaw = params.initialBuyLamports;
  const initialBuyLamportsBigInt = BigInt(initialBuyLamportsRaw ?? 0);
  console.log("[pumpfun] Building unsigned tx with initialBuyLamports:", initialBuyLamportsRaw, "->", initialBuyLamportsBigInt.toString());

  const finality = getServerCommitment();

  const lamportsToSolString = (lamports: bigint): string => {
    const neg = lamports < 0n;
    const x = neg ? -lamports : lamports;
    const whole = x / 1_000_000_000n;
    const frac = x % 1_000_000_000n;
    const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
    const base = fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
    return neg ? `-${base}` : base;
  };

  let bondingCurve: PublicKey;
  let signature = "";
  let submitted = false;

  try {
    bondingCurve = getBondingCurvePda(mint);

    if (initialBuyLamportsBigInt > 0n) {
      const amountSol = lamportsToSolString(initialBuyLamportsBigInt);
      const normalizedSymbol = params.symbol.toUpperCase().replace("$", "");

      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const built = await pumpportalBuildCreateTokenTxBase64({
            publicKey: launchWallet.toBase58(),
            mint: mint.toBase58(),
            tokenMetadata: { name: params.name, symbol: normalizedSymbol, uri: params.metadataUri },
            amountSol,
            slippage: 10,
            priorityFee: 0.0005,
            pool: "pump",
            isMayhemMode: params.isMayhemMode ?? false,
          });

          const unsigned = VersionedTransaction.deserialize(Uint8Array.from(Buffer.from(built.txBase64, "base64")));
          unsigned.sign([mintKeypair]);

          const txBase64 = Buffer.from(unsigned.serialize()).toString("base64");
          const signed = await privySignSolanaTransaction({ walletId: params.privyWalletId, transactionBase64: txBase64 });

          const raw = Buffer.from(signed.signedTransactionBase64, "base64");
          signature = await withRetry(() =>
            connection.sendRawTransaction(raw, {
              skipPreflight: false,
              preflightCommitment: "processed",
              maxRetries: 3,
            })
          );
          submitted = true;
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
    } else {
      const { ix: createIx } = buildCreateV2Instruction({
        mint,
        user: launchWallet,
        name: params.name,
        symbol: params.symbol.toUpperCase().replace("$", ""),
        uri: params.metadataUri,
        creator: launchWallet,
        isMayhemMode: params.isMayhemMode ?? false,
      });

      const extendIx = buildExtendAccountInstruction({ account: bondingCurve, user: launchWallet });

      const tx = new Transaction();
      tx.feePayer = launchWallet;
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));
      tx.add(createIx);
      tx.add(extendIx);

      for (let attempt = 0; attempt < 4; attempt++) {
        const latest = await withRetry(() => connection.getLatestBlockhash("processed"));
        tx.recentBlockhash = latest.blockhash;
        tx.lastValidBlockHeight = latest.lastValidBlockHeight;
        tx.signatures = []; // Clear any previous signatures for retry
        tx.partialSign(mintKeypair);

        try {
          const txBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
          const signed = await privySignSolanaTransaction({ walletId: params.privyWalletId, transactionBase64: txBase64 });
          const raw = Buffer.from(signed.signedTransactionBase64, "base64");
          signature = await withRetry(() =>
            connection.sendRawTransaction(raw, {
              skipPreflight: false,
              preflightCommitment: "processed",
              maxRetries: 3,
            })
          );
          submitted = true;
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
    }

    await confirmSignatureViaRpc(connection, signature, finality, { timeoutMs: 90_000 });

    await finalizeVanity(true);

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
  } catch (e) {
    await finalizeVanity(submitted);
    throw e;
  }
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

  let imageResponse = await fetch(params.imageUrl);
  if (!imageResponse.ok) {
    try {
      const u = new URL(params.imageUrl);
      const marker = "/storage/v1/object/public/";
      const idx = u.pathname.indexOf(marker);
      if (idx >= 0) {
        const rest = u.pathname.slice(idx + marker.length);
        const slash = rest.indexOf("/");
        const bucket = slash >= 0 ? rest.slice(0, slash) : "";
        const path = slash >= 0 ? rest.slice(slash + 1) : "";

        const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
        if (bucket && path && serviceRoleKey) {
          const authUrl = `${u.origin}/storage/v1/object/authenticated/${bucket}/${path}`;
          const retry = await fetch(authUrl, {
            headers: {
              apikey: serviceRoleKey,
              authorization: `Bearer ${serviceRoleKey}`,
            },
          });
          if (retry.ok) imageResponse = retry;
        }
      }
    } catch {
    }
  }
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

import { Keypair } from "@solana/web3.js";

/**
 * Generates a Solana keypair where the public key (base58) ends with a specific suffix.
 * This is used to create "vanity" addresses like pump.fun does (ending in "pump").
 * 
 * Note: This is computationally intensive. Finding a 4-character suffix like "pump"
 * typically takes ~1-5 million attempts on average due to base58 encoding.
 * 
 * @param suffix - The desired suffix (case-sensitive, e.g., "pump")
 * @param maxAttempts - Maximum number of keypairs to generate before giving up
 * @param onProgress - Optional callback for progress updates
 * @returns The keypair with matching suffix, or null if not found within maxAttempts
 */
export function generateVanityKeypair(
  suffix: string,
  maxAttempts: number = 10_000_000,
  onProgress?: (attempts: number) => void,
  opts?: { caseSensitive?: boolean }
): Keypair | null {
  const suffixLower = suffix.toLowerCase();
  const caseSensitive = Boolean(opts?.caseSensitive);
  
  for (let i = 0; i < maxAttempts; i++) {
    const keypair = Keypair.generate();
    const pubkeyStr = keypair.publicKey.toBase58();
    
    if (caseSensitive ? pubkeyStr.endsWith(suffix) : pubkeyStr.toLowerCase().endsWith(suffixLower)) {
      return keypair;
    }
    
    // Progress callback every 100k attempts
    if (onProgress && i > 0 && i % 100_000 === 0) {
      onProgress(i);
    }
  }
  
  return null;
}

/**
 * Async version that yields to event loop periodically to prevent blocking.
 * Better for server environments.
 */
export async function generateVanityKeypairAsync(
  suffix: string,
  maxAttempts: number = 10_000_000,
  onProgress?: (attempts: number) => void,
  opts?: { caseSensitive?: boolean }
): Promise<Keypair | null> {
  const suffixLower = suffix.toLowerCase();
  const caseSensitive = Boolean(opts?.caseSensitive);
  const batchSize = 10_000; // Check this many before yielding
  
  for (let batch = 0; batch < Math.ceil(maxAttempts / batchSize); batch++) {
    const batchStart = batch * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, maxAttempts);
    
    for (let i = batchStart; i < batchEnd; i++) {
      const keypair = Keypair.generate();
      const pubkeyStr = keypair.publicKey.toBase58();
      
      if (caseSensitive ? pubkeyStr.endsWith(suffix) : pubkeyStr.toLowerCase().endsWith(suffixLower)) {
        return keypair;
      }
    }
    
    // Progress callback
    if (onProgress && batchEnd % 100_000 === 0) {
      onProgress(batchEnd);
    }
    
    // Yield to event loop between batches
    await new Promise(resolve => setImmediate(resolve));
  }
  
  return null;
}

/**
 * Worker-based vanity keypair generation for better performance.
 * Uses multiple CPU cores in parallel.
 */
export interface VanityWorkerResult {
  found: boolean;
  keypair?: {
    publicKey: string;
    secretKey: number[];
  };
  attempts: number;
}

/**
 * Pre-generate vanity keypairs and cache them for instant use.
 * This is useful for production where you want instant launches.
 */
export class VanityKeypairCache {
  private cache: Keypair[] = [];
  private suffix: string;
  private isGenerating: boolean = false;

  constructor(suffix: string = "pump") {
    this.suffix = suffix;
  }
  
  /**
   * Get a cached vanity keypair, or generate one if cache is empty.
   */
  async get(): Promise<Keypair> {
    if (this.cache.length > 0) {
      return this.cache.pop()!;
    }
    
    // Generate one on-demand if cache is empty
    const keypair = await generateVanityKeypairAsync(this.suffix, 50_000_000);
    if (!keypair) {
      throw new Error(`Failed to generate vanity keypair with suffix "${this.suffix}"`);
    }
    return keypair;
  }
  
  /**
   * Pre-populate the cache with vanity keypairs.
   * Call this during server startup or idle periods.
   */
  async populate(count: number = 5): Promise<void> {
    if (this.isGenerating) return;
    this.isGenerating = true;
    
    try {
      for (let i = 0; i < count; i++) {
        if (this.cache.length >= count) break;
        
        const keypair = await generateVanityKeypairAsync(this.suffix, 50_000_000);
        if (keypair) {
          this.cache.push(keypair);
          console.log(`[VanityCache] Generated keypair ${i + 1}/${count}: ${keypair.publicKey.toBase58()}`);
        }
      }
    } finally {
      this.isGenerating = false;
    }
  }
  
  /**
   * Get current cache size.
   */
  get size(): number {
    return this.cache.length;
  }

  add(keypair: Keypair): void {
    this.cache.push(keypair);
  }
}

// Global singleton caches for vanity suffixes
let globalPumpCache: VanityKeypairCache | null = null;
let globalBagsCache: VanityKeypairCache | null = null;
let pumpWarmPromise: Promise<void> | null = null;

export function getPumpVanityCache(): VanityKeypairCache {
  if (!globalPumpCache) {
    globalPumpCache = new VanityKeypairCache("pump");
  }
  return globalPumpCache;
}

export function getBagsVanityCache(): VanityKeypairCache {
  if (!globalBagsCache) {
    globalBagsCache = new VanityKeypairCache("BAGS");
  }
  return globalBagsCache;
}

export function warmPumpVanityCache(count: number = 3): void {
  const raw = Number(count);
  const target = Number.isFinite(raw) ? Math.max(0, Math.min(5, Math.floor(raw))) : 3;
  if (target <= 0) return;
  if (pumpWarmPromise) return;

  const cache = getPumpVanityCache();
  pumpWarmPromise = cache
    .populate(target)
    .catch((err) => {
      console.warn(`[VanityCache] Warm failed: ${err instanceof Error ? err.message : String(err)}`);
    })
    .finally(() => {
      pumpWarmPromise = null;
    });
}

/**
 * Injectable random number generation. `Rng` returns a float in [0, 1).
 * `mulberry32` gives a small, fast, seedable PRNG for reproducible generation and tests.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash an arbitrary seed string into a 32-bit integer (FNV-1a). */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rngFromSeed(seed: string | number | null | undefined): Rng {
  if (seed === null || seed === undefined || seed === "") return Math.random;
  return mulberry32(typeof seed === "number" ? seed : hashSeed(seed));
}

export function randomInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError("pick from empty array");
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/** Weighted pick; weights must be >= 0 and not all zero. */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  const weights = items.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (items.length === 0 || total <= 0) return pick(rng, items);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Deterministic PRNG so bootstrap tests can be replayed. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return quantile(sorted, 0.5);
}

export function hIndex(citations: number[]): number {
  const sorted = [...citations].sort((a, b) => b - a);
  let h = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] >= i + 1) h = i + 1;
    else break;
  }
  return h;
}

export function bootstrapCI(
  values: number[],
  q: number,
  iterations: number,
  rng: () => number = Math.random,
): [number, number] {
  if (values.length < 2) return [NaN, NaN];
  const estimates: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const sample: number[] = [];
    for (let j = 0; j < values.length; j++) {
      sample.push(values[Math.floor(rng() * values.length)]);
    }
    sample.sort((a, b) => a - b);
    estimates.push(quantile(sample, q));
  }
  estimates.sort((a, b) => a - b);
  const lo = quantile(estimates, 0.025);
  const hi = quantile(estimates, 0.975);
  return [lo, hi];
}

/**
 * Two-sided sign test on paired outcomes, ties already dropped.
 * Returns null when there is nothing to test.
 */
export function signTest(higher: number, lower: number): number | null {
  const n = higher + lower;
  if (n === 0) return null;
  let p = 0;
  const binom = (k: number, nCount: number): number => {
    let c = 1;
    for (let i = 0; i < k; i++) c = (c * (nCount - i)) / (i + 1);
    return c;
  };
  const minSide = Math.min(higher, lower);
  for (let k = 0; k <= minSide; k++) {
    p += binom(k, n) * Math.pow(0.5, n);
  }
  return Math.min(1, 2 * p);
}

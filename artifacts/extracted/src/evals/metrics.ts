TypeScript

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function variance(xs: number[]) {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  return mean(xs.map(x => (x - m) ** 2));
}

export function pct(numerator: number, denominator: number) {
  return denominator <= 0 ? 0 : numerator / denominator;
}

export function deltaPct(current: number, baseline: number) {
  if (baseline === 0) return current === 0 ? 0 : 1;
  return (current - baseline) / Math.abs(baseline);
}

export function passBand(value: number, opts: {
  min?: number;
  max?: number;
}) {
  if (typeof opts.min === 'number' && value < opts.min) return false;
  if (typeof opts.max === 'number' && value > opts.max) return false;
  return true;
}
4. Benchmark suite loader
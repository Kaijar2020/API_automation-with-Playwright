import fs from 'fs';
import path from 'path';

// Every API call appends one line here; global teardown turns them into reports/performance.{json,md}.
export const METRICS_DIR = path.resolve(__dirname, '..', '..', 'reports', 'perf');

export interface Metric {
  endpoint: string;   // "GET /Advices/{id}"
  status: number;
  ms: number;
  bytes: number;
  sla: number;
  test: string;
  at: string;
}

const file = path.join(METRICS_DIR, `metrics-${process.pid}.jsonl`);

export function recordMetric(m: Metric) {
  try {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
    fs.appendFileSync(file, JSON.stringify(m) + '\n');
  } catch { /* metrics must never break a test */ }
}

export function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

export function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const avg = s.reduce((n, v) => n + v, 0) / (s.length || 1);
  return { count: s.length, min: s[0] ?? 0, avg: Math.round(avg), p50: percentile(s, 50), p95: percentile(s, 95), max: s[s.length - 1] ?? 0 };
}

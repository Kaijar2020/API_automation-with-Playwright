import fs from 'fs';
import path from 'path';
import { METRICS_DIR, Metric, stats } from './metrics';
import { sweepLedger } from '../cleanup/sweep-ledger';

/**
 * Aggregates every recorded API call into:
 *   reports/performance.json  (machine readable, for CI trends)
 *   reports/performance.md    (table per endpoint: count, min, avg, p50, p95, max, budget)
 * and prints the endpoints that went over budget.
 */
export default async function globalTeardown() {
  writePerformanceReport();
  // Last safety net: anything a test could not delete. Fails the run if records are left behind.
  const leftovers = await sweepLedger('after run');
  if (leftovers.length) {
    throw new Error(`${leftovers.length} test record(s) are still in the database, see reports/cleanup.md`);
  }
}

function writePerformanceReport() {
  if (!fs.existsSync(METRICS_DIR)) return;
  const metrics: Metric[] = fs.readdirSync(METRICS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .flatMap(f => fs.readFileSync(path.join(METRICS_DIR, f), 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)));
  if (!metrics.length) return;

  const byEndpoint = new Map<string, Metric[]>();
  for (const m of metrics) byEndpoint.set(m.endpoint, [...(byEndpoint.get(m.endpoint) ?? []), m]);

  const rows = [...byEndpoint.entries()].map(([endpoint, list]) => {
    const s = stats(list.map(m => m.ms));
    const sla = list[0].sla;
    return {
      endpoint, ...s, sla,
      overBudget: list.filter(m => m.ms > sla).length,
      errors5xx: list.filter(m => m.status >= 500).length,
      avgKb: +(list.reduce((n, m) => n + m.bytes, 0) / list.length / 1024).toFixed(1),
      verdict: s.p95 <= sla ? 'OK' : 'SLOW',
    };
  }).sort((a, b) => b.p95 - a.p95);

  const all = stats(metrics.map(m => m.ms));
  const summary = {
    generatedAt: new Date().toISOString(),
    requests: metrics.length,
    overall: all,
    slowEndpoints: rows.filter(r => r.verdict === 'SLOW').length,
    errors5xx: metrics.filter(m => m.status >= 500).length,
    endpoints: rows,
  };

  const reports = path.dirname(METRICS_DIR);
  fs.writeFileSync(path.join(reports, 'performance.json'), JSON.stringify(summary, null, 2));

  const md = [
    `# API performance - ${summary.generatedAt}`,
    '',
    `Requests: **${summary.requests}** | overall p50 **${all.p50} ms**, p95 **${all.p95} ms**, max **${all.max} ms** | ` +
      `endpoints over budget (p95): **${summary.slowEndpoints}** | 5xx: **${summary.errors5xx}**`,
    '',
    '| Endpoint | Calls | Min | Avg | p50 | p95 | Max | Budget | Over budget | 5xx | Avg KB | |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
    ...rows.map(r => `| \`${r.endpoint}\` | ${r.count} | ${r.min} | ${r.avg} | ${r.p50} | ${r.p95} | ${r.max} | ${r.sla} | ${r.overBudget} | ${r.errors5xx} | ${r.avgKb} | ${r.verdict === 'OK' ? '✅' : '⚠️'} |`),
  ].join('\n');
  fs.writeFileSync(path.join(reports, 'performance.md'), md + '\n');

  const slow = rows.filter(r => r.verdict === 'SLOW').slice(0, 10);
  console.log(`\nAPI performance: ${summary.requests} requests, p50 ${all.p50} ms, p95 ${all.p95} ms, max ${all.max} ms -> reports/performance.md`);
  if (slow.length) {
    console.log('Endpoints over budget (p95):');
    for (const r of slow) console.log(`  ${r.endpoint.padEnd(60)} p95 ${String(r.p95).padStart(6)} ms  (budget ${r.sla} ms)`);
  }
}

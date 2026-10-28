import { test, expect } from '@fixtures';
import { perf } from '../../config/performance';
import { stats } from '../../src/perf/metrics';
import { LOAD_ENDPOINTS } from './endpoints';

/**
 * Concurrent load: PERF_CONCURRENCY requests at the same time, 3 waves.
 * Passes when there are no errors / 5xx and p95 stays within budget x PERF_LOAD_FACTOR.
 * Kept small on purpose: this checks the API degrades gracefully, it is not a stress test.
 */
const WAVES = 3;

test.describe('Concurrent load @perf', () => {
  for (const e of LOAD_ENDPOINTS) {
    test(`${e.name} under ${perf.concurrency} concurrent requests`, async ({ authedCtx }) => {
      const first = await e.call(authedCtx);
      first.expectStatus(200);
      const allowed = first.sla * perf.loadFactor;

      const times: number[] = [];
      const statuses: number[] = [];
      const started = Date.now();
      for (let w = 0; w < WAVES; w++) {
        const wave = await Promise.all(Array.from({ length: perf.concurrency }, () => e.call(authedCtx)));
        for (const r of wave) { times.push(r.elapsed); statuses.push(r.status); }
      }
      const seconds = (Date.now() - started) / 1000;
      const s = stats(times);
      const failed = statuses.filter(st => st !== 200);
      const throughput = +(times.length / seconds).toFixed(1);

      await test.info().attach('load result', {
        contentType: 'application/json',
        body: JSON.stringify({ endpoint: e.name, concurrency: perf.concurrency, waves: WAVES, requests: times.length,
          throughputPerSec: throughput, allowedP95Ms: allowed, ...s, failedStatuses: failed }, null, 2),
      });

      expect(failed, `${failed.length}/${statuses.length} requests failed under load: ${[...new Set(failed)].join(', ')}`).toEqual([]);
      expect(s.p95, `${e.name} p95 under load ${s.p95} ms, allowed ${allowed} ms (${throughput} req/s)`).toBeLessThanOrEqual(allowed);
    });
  }
});

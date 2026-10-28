import { test, expect } from '@fixtures';
import { perf } from '../../config/performance';
import { stats } from '../../src/perf/metrics';
import { READ_ENDPOINTS, missingId } from './endpoints';

/**
 * Response time per endpoint: 1 warm-up call, then PERF_SAMPLES sequential calls.
 * Passes when every call succeeds, p95 is within the endpoint budget and the body is not oversized.
 */
test.describe('Response time (sequential) @perf', () => {
  for (const e of READ_ENDPOINTS) {
    test(`${e.name} p95 within budget`, async ({ authedCtx }) => {
      test.skip(missingId(e), 'Needs DOCTOR_ID / PATIENT_ID in .env');

      const warmUp = await e.call(authedCtx);
      warmUp.expectStatus(200);

      const times: number[] = [];
      for (let i = 0; i < perf.samples; i++) {
        const res = await e.call(authedCtx);
        expect(res.status, `sample ${i + 1}`).toBe(200);
        times.push(res.elapsed);
      }
      const s = stats(times);
      const budget = warmUp.sla;
      await test.info().attach('timings', {
        contentType: 'application/json',
        body: JSON.stringify({ endpoint: e.name, budgetMs: budget, ...s, samples: times }, null, 2),
      });

      warmUp.expectMaxSize();
      expect.soft(s.p50, `${e.name} p50 ${s.p50} ms (budget ${budget} ms)`).toBeLessThanOrEqual(budget);
      expect(s.p95, `${e.name} p95 ${s.p95} ms, budget ${budget} ms. Samples: ${times.join(', ')}`).toBeLessThanOrEqual(budget);
    });
  }
});

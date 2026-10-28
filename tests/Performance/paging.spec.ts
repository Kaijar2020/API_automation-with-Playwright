import { test, expect } from '@fixtures';
import * as apis from '@api/index';
import { perf } from '../../config/performance';

/**
 * Paging performance on the big catalogs:
 * - a 100-item page stays within budget and is not disproportionately slower than a 10-item page
 * - the last page (deep offset) is as fast as the first one (no full-table scans)
 */
const CATALOGS = [
  { name: 'Medicines', list: (c: any, page: number, pageSize: number) => new apis.MedicinesApi(c).getAll({ page, pageSize }) },
  { name: 'Diagnosis', list: (c: any, page: number, pageSize: number) => new apis.DiagnosisApi(c).getAll({ page, pageSize }) },
  { name: 'Examinations', list: (c: any, page: number, pageSize: number) => new apis.ExaminationsApi(c).getAll({ page, pageSize }) },
  { name: 'Advices', list: (c: any, page: number, pageSize: number) => new apis.AdvicesApi(c).getAll({ page, pageSize }) },
];

test.describe('Paging performance @perf', () => {
  for (const cat of CATALOGS) {
    test(`GET /${cat.name}: pageSize 100 within budget`, async ({ authedCtx }) => {
      await cat.list(authedCtx, 1, 10); // warm-up
      const small = await cat.list(authedCtx, 1, 10);
      const large = await cat.list(authedCtx, 1, 100);
      small.expectStatus(200);
      large.expectStatus(200);
      large.expectPagination(1, 100).expectResponseTime().expectMaxSize();
      // 10x the rows should not cost more than ~4x the time (+200 ms network noise).
      expect.soft(large.elapsed, `pageSize 100 took ${large.elapsed} ms vs ${small.elapsed} ms for 10`).toBeLessThanOrEqual(small.elapsed * 4 + 200);
    });

    test(`GET /${cat.name}: last page as fast as the first`, async ({ authedCtx }) => {
      const first = await cat.list(authedCtx, 1, 20);
      first.expectStatus(200);
      const lastPage = first.pagination.totalPages;
      test.skip(lastPage < 3, 'Not enough data for a deep page');

      const last = await cat.list(authedCtx, lastPage, 20);
      last.expectStatus(200);
      last.expectPagination(lastPage, 20).expectResponseTime();
      expect(last.data.length, 'last page is not empty').toBeGreaterThan(0);
      expect.soft(last.elapsed, `page ${lastPage} took ${last.elapsed} ms vs ${first.elapsed} ms for page 1`)
        .toBeLessThanOrEqual(Math.max(first.elapsed * 3, perf.sla.read));
    });
  }
});

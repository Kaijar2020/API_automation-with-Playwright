import { test, expect } from '@fixtures';
import { ExaminationsApi } from '@api/index';
import { doctorId } from '@utils/ids';

// Swagger tag: Examinations (read-only catalog)

test.describe('Examinations @smoke', () => {
  test('GET /Examinations returns a page of examination notes', async ({ examinations }) => {
    const res = await examinations.getAll({ pageSize: 5 });
    const data = res.expectStatus(200);
    expect(data.length).toBe(5);
    expect(res.pagination.totalElements).toBeGreaterThan(5);
    res.expectPagination(1, 5);
  });

  test('GET /Examinations/search finds notes by keyword', async ({ examinations }) => {
    const data = (await examinations.search('tenderness')).expectStatus(200);
    expect(data.length).toBeGreaterThan(0);
    for (const e of data) expect(`${e.clinicalNoteEn} ${e.clinicalNoteBn}`.toLowerCase()).toContain('tender');
  });

  test('GET /Examinations/combined-search returns catalog + doctor notes', async ({ examinations }) => {
    expect(Array.isArray((await examinations.combinedSearch('tender', doctorId)).expectStatus(200))).toBe(true);
  });

  test('page 2 does not repeat page 1', async ({ examinations }) => {
    const p1 = (await examinations.getAll({ page: 1, pageSize: 5 })).expectStatus(200);
    const p2 = (await examinations.getAll({ page: 2, pageSize: 5 })).expectStatus(200);
    const ids = new Set(p1.map((e: any) => e.id));
    for (const e of p2) expect(ids.has(e.id)).toBe(false);
  });

  test('requests without a token return 401', async ({ anon }) => {
    (await anon(ExaminationsApi).getAll()).expectUnauthorized();
  });
});

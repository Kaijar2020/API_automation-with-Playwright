import { test, expect } from '@fixtures';
import { KnownCasesApi } from '@api/index';

// Swagger tag: KnownCases

test.describe('Known cases @smoke', () => {
  test('GET /KnownCases lists known cases with English labels', async ({ knownCases }) => {
    const data = (await knownCases.getAll()).expectStatus(200);
    expect(data.length).toBeGreaterThan(0);
    for (const c of data) expect(c.labelEn).toBeTruthy();
  });

  test('requests without a token return 401', async ({ anon }) => {
    (await anon(KnownCasesApi).getAll()).expectUnauthorized();
  });
});

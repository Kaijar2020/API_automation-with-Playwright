import { test, expect } from '@fixtures';
import { knownBug } from '@utils/allure';
import { InvestigationsApi } from '@api/index';
import { investigation } from '@data/payloads';
import { doctorId } from '@utils/ids';

// Swagger tag: Investigations

test.describe('Investigations - read @smoke', () => {
  test('GET /investigations/search finds tests by keyword', async ({ investigations }) => {
    const data = (await investigations.search('cbc', 'male', 30)).expectStatus(200);
    expect(data.length).toBeGreaterThan(0);
  });

  test('GET /investigations/combined-search returns catalog + doctor tests', async ({ investigations }) => {
    (await investigations.combinedSearch('cbc', doctorId)).expectStatus(200);
  });

  test('GET /investigations/panels lists panels', async ({ investigations }) => {
    const data = (await investigations.getPanels({ pageSize: 5 })).expectStatus(200);
    expect(data.length).toBeGreaterThan(0);
  });

  test('GET /investigations/panels/{id} and /tests return the panel', async ({ investigations }) => {
    const [panel] = (await investigations.getPanels({ pageSize: 1 })).expectStatus(200);
    const panelId = panel.id ?? panel.panelId;
    (await investigations.getPanel(panelId)).expectStatus(200);
    const withTests = (await investigations.getPanelTests(panelId, 'male', 30)).expectStatus(200);
    expect(withTests.panelId ?? panelId).toBe(panelId);
  });

  test('GET /investigations/tests/{id} returns a test from a panel', async ({ investigations }) => {
    const panels = (await investigations.getPanels({ pageSize: 20 })).expectStatus(200);
    for (const p of panels) {
      const tests = (await investigations.getPanelTests(p.id ?? p.panelId)).expectStatus(200).tests ?? [];
      if (!tests.length) continue;
      const one = (await investigations.getTest(tests[0].testId)).expectStatus(200);
      expect(JSON.stringify(one)).toContain(String(tests[0].testId));
      return;
    }
    test.skip(true, 'No panel with tests found');
  });

  test('POST /investigations/abnormality evaluates results', async ({ investigations }) => {
    const panels = (await investigations.getPanels({ pageSize: 20 })).expectStatus(200);
    const tests = (await investigations.getPanelTests(panels[0].id ?? panels[0].panelId, 'male', 30)).expectStatus(200).tests ?? [];
    test.skip(!tests.length, 'No test available');
    (await investigations.checkAbnormality({ gender: 'male', age: 30, testResults: [{ testId: tests[0].testId, value: 999999 }] })).expectStatus(200);
  });
});

test.describe('Investigations - panel and test CRUD @crud', () => {
  // Test and panel are deleted after the test (test first, then panel) even if a step fails.
  test('create, update and delete a panel with a test', async ({ investigations }) => {
    await knownBug('POST /investigations/panels always answers 400 UNIQUE_VIOLATION, even for unique names.');

    const panelId = await test.step('POST /investigations/panels creates a panel', async () => {
      const data = (await investigations.createPanel(investigation.panel())).expectStatus([200, 201]);
      return Number(data?.panelId ?? data?.id ?? data);
    });

    const testId = await test.step('POST /investigations/tests adds a test to the panel', async () => {
      const data = (await investigations.createTest(investigation.test(panelId))).expectStatus([200, 201]);
      return Number(data?.testId ?? data?.id ?? data);
    });

    await test.step('PUT /investigations/tests/{id} and /panels/{id} update them', async () => {
      (await investigations.updateTest(testId, investigation.test(panelId))).expectStatus(200);
      (await investigations.updatePanel(panelId, investigation.panel())).expectStatus(200);
    });

    await test.step('DELETE /investigations/tests/{id} and /panels/{id} remove them', async () => {
      (await investigations.deleteTest(testId)).expectStatus([200, 204]);
      (await investigations.deletePanel(panelId)).expectStatus([200, 204]);
    });
  });
});

test.describe('Investigations - negative', () => {
  const UNKNOWN = 987654321;

  test('panel: GET, PUT and DELETE with an unknown id return 404', async ({ investigations }) => {
    (await investigations.getPanel(UNKNOWN)).expectNotFound();
    (await investigations.updatePanel(UNKNOWN, investigation.panel())).expectNotFound();
    (await investigations.deletePanel(UNKNOWN)).expectNotFound();
  });

  test('test: GET, PUT and DELETE with an unknown id return 404', async ({ investigations }) => {
    (await investigations.getTest(UNKNOWN)).expectNotFound();
    (await investigations.updateTest(UNKNOWN, investigation.test(UNKNOWN))).expectNotFound();
    (await investigations.deleteTest(UNKNOWN)).expectNotFound();
  });

  test('GET /investigations/search with no match returns an empty list', async ({ investigations }) => {
    expect((await investigations.search('zzqxwvnomatch')).expectStatus(200)).toEqual([]);
  });

  test('POST /investigations/abnormality with no results or an unknown test returns no flags', async ({ investigations }) => {
    expect((await investigations.checkAbnormality({ gender: 'male', age: 30, testResults: [] })).expectStatus(200), 'no results').toEqual([]);
    expect((await investigations.checkAbnormality({ gender: 'male', age: 30, testResults: [{ testId: UNKNOWN, value: 1 }] })).expectStatus(200), 'unknown test').toEqual([]);
  });

  test('requests without a token return 401', async ({ anon }) => {
    const api = anon(InvestigationsApi);
    (await api.getPanels()).expectUnauthorized();
    (await api.createPanel(investigation.panel())).expectUnauthorized();
    (await api.createTest(investigation.test(UNKNOWN))).expectUnauthorized();
    (await api.deletePanel(UNKNOWN)).expectUnauthorized();
  });
});

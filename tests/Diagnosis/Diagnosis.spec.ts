import { test, expect } from '@fixtures';
import { DiagnosisApi } from '@api/index';
import { catalog } from '@data/payloads';
import { doctorId } from '@utils/ids';

// Swagger tag: Diagnosis (no GET /{id}: records are read back through search)

test.describe('Diagnosis - read @smoke', () => {
  test('GET /Diagnosis returns a page of diagnoses', async ({ diagnosis }) => {
    const res = await diagnosis.getAll({ pageSize: 5 });
    const data = res.expectStatus(200);
    res.expectPagination(1, 5);
    expect(data.length).toBeGreaterThan(0);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test('GET /Diagnosis/search finds diagnoses by keyword', async ({ diagnosis }) => {
    const data = (await diagnosis.search('diabetes')).expectStatus(200);
    expect(data.length).toBeGreaterThan(0);
    // Search also matches codes/descriptions, so not every name contains the keyword.
    expect(data.some((d: any) => /diabetes/i.test(d.name))).toBe(true);
  });

  test('GET /Diagnosis/combined-search returns catalog + doctor diagnoses', async ({ diagnosis }) => {
    expect(Array.isArray((await diagnosis.combinedSearch('diab', doctorId)).expectStatus(200))).toBe(true);
  });
});

test.describe('Diagnosis - CRUD @crud', () => {
  test('create, find, update and delete a diagnosis', async ({ diagnosis }) => {
    const body = catalog.diagnosis();
    const find = async (id: string, name: string) =>
      (await diagnosis.search(name)).expectStatus(200).find((d: any) => d.id === id);

    const id = await test.step('POST /Diagnosis creates a diagnosis (201)', async () => {
      const data = (await diagnosis.create(body)).expectStatus(201);
      expect(data).toMatchObject({ ...body, isActive: true });
      return data.id as string;
    });

    await test.step('created diagnosis is found by search', async () => {
      expect(await find(id, body.name)).toMatchObject({ id, name: body.name });
    });

    await test.step('PUT /Diagnosis/{id} updates the diagnosis', async () => {
      const changes = catalog.diagnosis();
      (await diagnosis.update(id, changes)).expectStatus(200);
      expect(await find(id, changes.name)).toMatchObject({ id, name: changes.name });
    });

    await test.step('DELETE /Diagnosis/{id} removes the diagnosis', async () => {
      (await diagnosis.remove(id)).expectStatus([200, 204]);
      expect(await find(id, body.name)).toBeUndefined();
    });
  });
});

test.describe('Diagnosis - negative', () => {
  test('PUT /Diagnosis/{id} with unknown id returns 404', async ({ diagnosis }) => {
    (await diagnosis.update(crypto.randomUUID(), catalog.diagnosis())).expectNotFound();
  });

  test('DELETE /Diagnosis/{id} with unknown id returns 404', async ({ diagnosis }) => {
    (await diagnosis.remove(crypto.randomUUID())).expectNotFound();
  });

  // Records the API wrongly accepts are deleted after the test (guaranteed cleanup).

  for (const [label, value] of [['an empty', ''], ['a blank', '   ']]) {
    test(`POST /Diagnosis with ${label} name returns 400`, async ({ diagnosis }) => {
      (await diagnosis.create({ ...catalog.diagnosis(), name: value })).expectValidationError('name');
    });
  }

  test('POST /Diagnosis with a too long name returns 400', async ({ diagnosis }) => {
    (await diagnosis.create({ ...catalog.diagnosis(), name: `[AUTO] ${'x'.repeat(5000)}` })).expectValidationError('name');
  });

  test('GET /Diagnosis/search with no match returns an empty list', async ({ diagnosis }) => {
    expect((await diagnosis.search('zzqxwvnomatch')).expectStatus(200)).toEqual([]);
  });

  test('requests without a token return 401', async ({ anon }) => {
    const api = anon(DiagnosisApi);
    (await api.getAll()).expectUnauthorized();
    (await api.create(catalog.diagnosis())).expectUnauthorized();
    (await api.update(crypto.randomUUID(), catalog.diagnosis())).expectUnauthorized();
    (await api.remove(crypto.randomUUID())).expectUnauthorized();
  });
});

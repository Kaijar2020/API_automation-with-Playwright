import { test, expect } from '@fixtures';
import { MedicinesApi } from '@api/index';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

// Swagger tag: Medicines (read-only catalog)

test.describe('Medicines @smoke', () => {
  test('GET /Medicines returns a page of medicines', async ({ medicines }) => {
    const res = await medicines.getAll({ pageSize: 5 });
    const data = res.expectStatus(200);
    res.expectPagination(1, 5);
    expect(data).toHaveLength(5);
  });

  test('GET /Medicines/{id} returns the medicine from the list', async ({ medicines }) => {
    const [first] = (await medicines.getAll({ pageSize: 1 })).expectStatus(200);
    const one = (await medicines.getById(first.medicineId)).expectStatus(200);
    expect(one).toMatchObject({ medicineId: first.medicineId, brandName: first.brandName });
  });

  test('GET /Medicines/search finds by brand name', async ({ medicines }) => {
    const data = (await medicines.search('napa')).expectStatus(200);
    expect(data.some((m: any) => /napa/i.test(`${m.brandName} ${m.genericName}`))).toBe(true);
  });

  test('page 2 does not repeat page 1', async ({ medicines }) => {
    const p1 = (await medicines.getAll({ page: 1, pageSize: 5 })).expectStatus(200);
    const p2 = (await medicines.getAll({ page: 2, pageSize: 5 })).expectStatus(200);
    const ids = new Set(p1.map((m: any) => m.medicineId));
    for (const m of p2) expect(ids.has(m.medicineId)).toBe(false);
  });
});

test.describe('Medicines - doctor combined', () => {
  test.skip(!doctorId, NEED_DOCTOR);

  test('GET /Medicines/combined returns catalog + personalised medicines', async ({ medicines }) => {
    (await medicines.combined(doctorId!)).expectStatus(200);
  });

  test('GET /Medicines/combined/search finds by brand name', async ({ medicines }) => {
    (await medicines.combinedSearch(doctorId!, 'napa')).expectStatus(200);
  });
});

test.describe('Medicines - negative', () => {
  test('GET /Medicines/{id} with unknown id returns 404', async ({ medicines }) => {
    (await medicines.getById(crypto.randomUUID())).expectNotFound();
  });

  test('GET /Medicines/combined/search without doctorId returns 400', async ({ medicines }) => {
    // Swagger marks doctorId optional, but the API requires it.
    (await medicines.get('/Medicines/combined/search', { query: { searchTerm: 'napa' } })).expectValidationError('doctorId');
  });

  test('requests without a token return 401', async ({ anon }) => {
    (await anon(MedicinesApi).getAll()).expectUnauthorized();
  });
});

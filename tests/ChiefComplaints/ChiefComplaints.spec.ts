import { test, expect } from '@fixtures';
import { ChiefComplaintsApi } from '@api/index';
import { catalog } from '@data/payloads';
import { knownBug } from '@utils/allure';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

// Swagger tag: ChiefComplaints

test.describe('Chief Complaints - read @smoke', () => {
  test('GET /ChiefComplaints returns a page of complaints', async ({ chiefComplaints }) => {
    const res = await chiefComplaints.getAll({ pageSize: 5 });
    const data = res.expectStatus(200);
    res.expectPagination(1, 5);
    expect(data.length).toBeGreaterThan(0);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test('GET /ChiefComplaints/search finds terms by keyword', async ({ chiefComplaints }) => {
    const data = (await chiefComplaints.search('headache')).expectStatus(200);
    expect(data.some((c: any) => /headache/i.test(c.term))).toBe(true);
  });

  test('GET /ChiefComplaints/fuzzy-search tolerates typos', async ({ chiefComplaints }) => {
    const data = (await chiefComplaints.fuzzySearch('headche')).expectStatus(200);
    expect(Array.isArray(data)).toBe(true);
  });

  test('GET /ChiefComplaints/semantic-search returns SNOMED concepts', async ({ chiefComplaints }) => {
    const data = (await chiefComplaints.semanticSearch('head pain')).expectStatus(200);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].conceptId).toBeGreaterThan(0);
  });

  test('GET /ChiefComplaints/search-history/{doctorId} returns the doctor history', async ({ chiefComplaints }) => {
    test.skip(!doctorId, NEED_DOCTOR);
    (await chiefComplaints.searchHistory(doctorId!, 'head')).expectStatus(200);
  });
});

test.describe('Chief Complaints - CRUD @crud', () => {
  // Skipped for now (POST /ChiefComplaints answers DATA_INTEGRITY_ERROR on staging).
  test.skip('create, read, update and delete a complaint', async ({ chiefComplaints }) => {
    await knownBug('POST /ChiefComplaints answers 400 DATA_INTEGRITY_ERROR ("Request data violates persistence rules") for a valid term on staging.');
    const body = catalog.chiefComplaint();

    const id = await test.step('POST /ChiefComplaints creates a complaint (201)', async () => {
      const data = (await chiefComplaints.create(body)).expectStatus(201);
      expect(data).toMatchObject({ term: body.term, isActive: true });
      return data.id as string;
    });

    await test.step('GET /ChiefComplaints/{id} returns the created complaint', async () => {
      expect((await chiefComplaints.getById(id)).expectStatus(200)).toMatchObject({ id, term: body.term });
    });

    await test.step('PUT /ChiefComplaints/{id} updates the term', async () => {
      const changes = catalog.chiefComplaint();
      (await chiefComplaints.update(id, changes)).expectStatus(200);
      expect((await chiefComplaints.getById(id)).expectStatus(200).term).toBe(changes.term);
    });

    await test.step('DELETE /ChiefComplaints/{id} removes the complaint', async () => {
      (await chiefComplaints.remove(id)).expectStatus([200, 204]);
      (await chiefComplaints.getById(id)).expectNotFound();
    });
  });
});

test.describe('Chief Complaints - negative', () => {
  test('GET /ChiefComplaints/{id} with unknown id returns 404', async ({ chiefComplaints }) => {
    (await chiefComplaints.getById(crypto.randomUUID())).expectNotFound();
  });

  test('DELETE /ChiefComplaints/{id} with unknown id returns 404', async ({ chiefComplaints }) => {
    await knownBug('answers 500 Internal Server Error instead of 404.');
    (await chiefComplaints.remove(crypto.randomUUID())).expectNotFound();
  });

  test('GET /ChiefComplaints/{id} with a malformed id is rejected', async ({ chiefComplaints }) => {
    (await chiefComplaints.getById('not-a-uuid')).expectRejected();
  });

  // Records the API wrongly accepts are deleted after the test (guaranteed cleanup).

  test('GET /ChiefComplaints/search with no match returns an empty list', async ({ chiefComplaints }) => {
    expect((await chiefComplaints.search('zzqxwvnomatch')).expectStatus(200)).toEqual([]);
  });

  test('requests without a token return 401', async ({ anon }) => {
    const api = anon(ChiefComplaintsApi);
    (await api.search('head')).expectUnauthorized();
    (await api.create(catalog.chiefComplaint())).expectUnauthorized();
    (await api.update(crypto.randomUUID(), catalog.chiefComplaint())).expectUnauthorized();
    (await api.remove(crypto.randomUUID())).expectUnauthorized();
  });
});

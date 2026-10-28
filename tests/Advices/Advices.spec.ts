import { test, expect } from '@fixtures';
import { AdvicesApi } from '@api/index';
import { catalog } from '@data/payloads';
import { doctorId } from '@utils/ids';

// Swagger tag: Advices. Every expectStatus() also validates the response against Swagger.

test.describe('Advices - read @smoke', () => {
  test('GET /Advices returns a page of advices', async ({ advices }) => {
    const res = await advices.getAll({ page: 1, pageSize: 5 });
    const data = res.expectStatus(200);
    expect(data.length).toBeGreaterThan(0);
    expect(data.length).toBeLessThanOrEqual(5);
    res.expectPagination(1, 5);
  });

  test('GET /Advices page after the last one is empty', async ({ advices }) => {
    const first = await advices.getAll({ page: 1, pageSize: 5 });
    first.expectStatus(200);
    // Far enough past the end that advices created by parallel tests cannot add a page in between.
    const beyond = first.pagination.totalPages + 10;
    const res = await advices.getAll({ page: beyond, pageSize: 5 });
    expect(res.expectStatus(200)).toEqual([]);
    expect(res.pagination.totalPages, 'requested page is past the last one').toBeLessThan(beyond);
  });

  test('GET /Advices/search finds advices by keyword', async ({ advices }) => {
    const data = (await advices.search('avoid')).expectStatus(200);
    expect(data.length).toBeGreaterThan(0);
    for (const a of data) expect(`${a.descriptionEn} ${a.descriptionBn}`.toLowerCase()).toContain('avoid');
  });

  test('GET /Advices/combined-search returns catalog + doctor advices', async ({ advices }) => {
    const data = (await advices.combinedSearch('avoid', doctorId)).expectStatus(200);
    expect(Array.isArray(data)).toBe(true);
  });
});

test.describe('Advices - CRUD @crud', () => {
  // One test per lifecycle: the advice is deleted after the test even if a step fails.
  test('create, read, update and delete an advice', async ({ advices }) => {
    const body = catalog.advice();

    const id = await test.step('POST /Advices creates an advice (201)', async () => {
      const data = (await advices.create(body)).expectStatus(201);
      expect(data).toMatchObject({ ...body, isActive: true });
      return data.id as string;
    });

    await test.step('GET /Advices/{id} returns the created advice', async () => {
      expect((await advices.getById(id)).expectStatus(200)).toMatchObject({ id, ...body });
    });

    await test.step('PUT /Advices/{id} updates the advice', async () => {
      const changes = catalog.advice();
      (await advices.update(id, changes)).expectStatus(200);
      expect((await advices.getById(id)).expectStatus(200)).toMatchObject(changes);
    });

    await test.step('DELETE /Advices/{id} removes the advice', async () => {
      // Swagger documents 204; the API answers 200 { data: true }.
      (await advices.remove(id)).expectStatus([200, 204]);
      (await advices.getById(id)).expectNotFound();
    });
  });
});

test.describe('Advices - negative', () => {
  test('GET /Advices/{id} with unknown id returns 404', async ({ advices }) => {
    (await advices.getById(crypto.randomUUID())).expectNotFound();
  });

  test('PUT /Advices/{id} with unknown id returns 404', async ({ advices }) => {
    (await advices.update(crypto.randomUUID(), catalog.advice())).expectNotFound();
  });

  test('DELETE /Advices/{id} with unknown id returns 404', async ({ advices }) => {
    (await advices.remove(crypto.randomUUID())).expectNotFound();
  });

  test('GET /Advices/{id} with a malformed id is rejected', async ({ advices }) => {
    (await advices.getById('not-a-uuid')).expectRejected();
  });

  // Records the API wrongly accepts are deleted after the test (guaranteed cleanup).

  test('POST /Advices with a too long descriptionEn returns 400', async ({ advices }) => {
    (await advices.create({ ...catalog.advice(), descriptionEn: `[AUTO] ${'x'.repeat(5000)}` })).expectValidationError('descriptionEn');
  });

  test('GET /Advices/search with no match returns an empty list', async ({ advices }) => {
    expect((await advices.search('zzqxwvnomatch')).expectStatus(200)).toEqual([]);
  });

  test('requests without a token return 401', async ({ anon }) => {
    const api = anon(AdvicesApi);
    (await api.getAll()).expectUnauthorized();
    (await api.getById(crypto.randomUUID())).expectUnauthorized();
    (await api.create(catalog.advice())).expectUnauthorized();
    (await api.update(crypto.randomUUID(), catalog.advice())).expectUnauthorized();
    (await api.remove(crypto.randomUUID())).expectUnauthorized();
  });
});

import { test, expect } from '@fixtures';
import { knownBug } from '@utils/allure';
import { ReferralsApi } from '@api/index';
import { catalog } from '@data/payloads';
import { doctorId } from '@utils/ids';

// Swagger tag: Referrals

test.describe('Referrals - read @smoke', () => {
  test('GET /Referrals returns a page of referrals', async ({ referrals }) => {
    const res = await referrals.getAll({ pageSize: 5 });
    const data = res.expectStatus(200);
    res.expectPagination(1, 5);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test('GET /Referrals/categories lists every category', async ({ referrals }) => {
    const data = (await referrals.categories()).expectStatus(200);
    expect(data.map((c: any) => c.value).sort()).toEqual(['admission', 'consultant', 'specialty']);
  });

  test('GET /Referrals/search filters by category', async ({ referrals }) => {
    const data = (await referrals.search('a', 'specialty')).expectStatus(200);
    for (const r of data) expect(r.category).toBe('specialty');
  });

  test('GET /Referrals/combined-search returns catalog + doctor referrals', async ({ referrals }) => {
    expect(Array.isArray((await referrals.combinedSearch('a', doctorId)).expectStatus(200))).toBe(true);
  });
});

test.describe('Referrals - CRUD @crud', () => {
  test('create, read, update and delete a referral', async ({ referrals }) => {
    const body = catalog.referral();

    const id = await test.step('POST /Referrals creates a referral (201)', async () => {
      const data = (await referrals.create(body)).expectStatus(201);
      expect(data).toMatchObject({ ...body, isActive: true });
      return data.id as string;
    });

    await test.step('GET /Referrals/{id} returns the created referral', async () => {
      expect((await referrals.getById(id)).expectStatus(200)).toMatchObject({ id, ...body });
    });

    await test.step('PUT /Referrals/{id} updates name and category', async () => {
      const changes = { ...catalog.referral(), category: 'admission' };
      (await referrals.update(id, changes)).expectStatus(200);
      expect((await referrals.getById(id)).expectStatus(200)).toMatchObject(changes);
    });

    await test.step('DELETE /Referrals/{id} removes the referral', async () => {
      (await referrals.remove(id)).expectStatus([200, 204]);
      (await referrals.getById(id)).expectNotFound();
    });
  });
});

test.describe('Referrals - negative', () => {
  test('POST /Referrals with an invalid category returns 400', async ({ referrals }) => {
    await knownBug('returns a raw ProblemDetails without the { success, error } envelope.');
    (await referrals.create({ ...catalog.referral(), category: 'not-a-category' })).expectValidationError('category');
  });

  test('GET /Referrals/{id} with unknown id returns 404', async ({ referrals }) => {
    (await referrals.getById(crypto.randomUUID())).expectNotFound();
  });

  test('PUT /Referrals/{id} with unknown id returns 404', async ({ referrals }) => {
    (await referrals.update(crypto.randomUUID(), catalog.referral())).expectNotFound();
  });

  test('DELETE /Referrals/{id} with unknown id returns 404', async ({ referrals }) => {
    (await referrals.remove(crypto.randomUUID())).expectNotFound();
  });

  test('GET /Referrals/{id} with a malformed id is rejected', async ({ referrals }) => {
    (await referrals.getById('not-a-uuid')).expectRejected();
  });

  // Records the API wrongly accepts are deleted after the test (guaranteed cleanup).

  for (const [label, value] of [['an empty', ''], ['a blank', '   ']]) {
    test(`POST /Referrals with ${label} name returns 400`, async ({ referrals }) => {
      (await referrals.create({ ...catalog.referral(), name: value })).expectValidationError('name');
    });
  }

  test('POST /Referrals with a too long name returns 400', async ({ referrals }) => {
    (await referrals.create({ ...catalog.referral(), name: `[AUTO] ${'x'.repeat(5000)}` })).expectValidationError('name');
  });

  test('GET /Referrals/search with no match returns an empty list', async ({ referrals }) => {
    expect((await referrals.search('zzqxwvnomatch', undefined)).expectStatus(200)).toEqual([]);
  });

  test('requests without a token return 401', async ({ anon }) => {
    const api = anon(ReferralsApi);
    (await api.getAll()).expectUnauthorized();
    (await api.create(catalog.referral())).expectUnauthorized();
    (await api.update(crypto.randomUUID(), catalog.referral())).expectUnauthorized();
    (await api.remove(crypto.randomUUID())).expectUnauthorized();
  });
});

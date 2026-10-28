import { test, expect } from '@fixtures';
import { DoctorReferralReferencesApi } from '@api/index';
import { doctorRef } from '@data/payloads';
import { extractId } from '@utils/data';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

// Swagger tag: DoctorReferralReferences (a doctor's personalised referrals)

test.describe('Doctor referral references', () => {
  test.skip(!doctorId, NEED_DOCTOR);

  test('GET /DoctorReferralReferences lists the doctor referrals @smoke', async ({ doctorReferralRefs }) => {
    (await doctorReferralRefs.list(doctorId)).expectStatus(200);
  });

  test('GET /DoctorReferralReferences/get-all-by-doctorId pages the doctor referrals @smoke', async ({ doctorReferralRefs }) => {
    const data = (await doctorReferralRefs.getAllByDoctorId({ doctorId, pageSize: 5 })).expectStatus(200);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test('GET /DoctorReferralReferences/category-counts adds up to the total', async ({ doctorReferralRefs }) => {
    const data = (await doctorReferralRefs.categoryCounts(doctorId!)).expectStatus(200);
    const sum = data.categories.reduce((n: number, c: any) => n + c.count, 0);
    expect(sum).toBe(data.total);
  });

  test.describe('CRUD @crud', () => {
    test('create, read, update and delete a personalised referral', async ({ doctorReferralRefs }) => {
      const body = doctorRef.referral(doctorId!);

      const id = await test.step('POST /DoctorReferralReferences creates a personalised referral', async () =>
        extractId((await doctorReferralRefs.create(body)).expectStatus([200, 201])));

      await test.step('GET /DoctorReferralReferences/{id} returns it', async () => {
        expect((await doctorReferralRefs.getById(id)).expectStatus(200)).toMatchObject({ name: body.name, category: body.category });
      });

      await test.step('PUT /DoctorReferralReferences/{id} updates it', async () => {
        const changes = { name: `${body.name} (updated)`, category: 'specialty', note: body.note };
        (await doctorReferralRefs.update(id, changes)).expectStatus(200);
        expect((await doctorReferralRefs.getById(id)).expectStatus(200)).toMatchObject(changes);
      });

      await test.step('DELETE /DoctorReferralReferences/{id} removes it', async () => {
        (await doctorReferralRefs.remove(id)).expectStatus([200, 204]);
      });
    });
  });

  test('POST + DELETE /DoctorReferralReferences/bulk @crud', async ({ doctorReferralRefs }) => {
    const items = [doctorRef.referral(doctorId!), doctorRef.referral(doctorId!)].map(({ doctorId: _, ...i }) => i);
    const created = (await doctorReferralRefs.bulkCreate(doctorId!, items)).expectStatus([200, 201]);
    const ids = (Array.isArray(created) ? created : created.items).map((x: any) => extractId(x));
    expect(ids).toHaveLength(2);
    (await doctorReferralRefs.bulkDelete(ids)).expectStatus([200, 204]);
  });
});

test.describe('Doctor referral references - negative', () => {
  test('get-all-by-doctorId without doctorId returns 400', async ({ doctorReferralRefs }) => {
    // Swagger marks doctorId optional, but the API requires it.
    (await doctorReferralRefs.getAllByDoctorId({})).expectValidationError('doctorId');
  });

  test('requests without a token return 401', async ({ anon }) => {
    (await anon(DoctorReferralReferencesApi).list()).expectUnauthorized();
  });
});

test.describe('DoctorReferralReferences - edge cases', () => {
  test.skip(!doctorId, NEED_DOCTOR);
  // Records the API wrongly accepts are deleted after the test (guaranteed cleanup).
  const withoutDoctor = () => { const { doctorId: _, ...rest } = doctorRef.referral(doctorId!); return rest; };

  test('GET, PUT and DELETE with an unknown id return 404', async ({ doctorReferralRefs }) => {
    const id = crypto.randomUUID();
    (await doctorReferralRefs.getById(id)).expectNotFound();
    (await doctorReferralRefs.update(id, withoutDoctor())).expectNotFound();
    (await doctorReferralRefs.remove(id)).expectNotFound();
  });

  test('POST without doctorId returns 400', async ({ doctorReferralRefs }) => {
    (await doctorReferralRefs.create(withoutDoctor())).expectValidationError('doctorId');
  });

  test('POST /bulk with no items returns 400', async ({ doctorReferralRefs }) => {
    (await doctorReferralRefs.bulkCreate(doctorId!, [])).expectValidationError('items');
  });

  test('POST without a token returns 401', async ({ anon }) => {
    (await anon(DoctorReferralReferencesApi).create(doctorRef.referral(doctorId!))).expectUnauthorized();
  });
});

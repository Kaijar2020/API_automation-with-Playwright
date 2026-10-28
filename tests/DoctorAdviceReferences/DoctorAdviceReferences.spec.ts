import { test, expect } from '@fixtures';
import { DoctorAdviceReferencesApi } from '@api/index';
import { doctorRef } from '@data/payloads';
import { extractId } from '@utils/data';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

// Swagger tag: DoctorAdviceReferences (a doctor's personalised advices)

test.describe('Doctor advice references', () => {
  test.skip(!doctorId, NEED_DOCTOR);

  test('GET /DoctorAdviceReferences lists the doctor advices @smoke', async ({ doctorAdviceRefs }) => {
    (await doctorAdviceRefs.list(doctorId)).expectStatus(200);
  });

  test('GET /DoctorAdviceReferences/get-all-by-doctorId pages the doctor advices @smoke', async ({ doctorAdviceRefs }) => {
    const data = (await doctorAdviceRefs.getAllByDoctorId({ doctorId, pageSize: 5 })).expectStatus(200);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test.describe('CRUD @crud', () => {
    test('create, read, update and delete a personalised advice', async ({ doctorAdviceRefs }) => {
      const body = doctorRef.advice(doctorId!);

      const id = await test.step('POST /DoctorAdviceReferences creates a personalised advice', async () =>
        extractId((await doctorAdviceRefs.create(body)).expectStatus([200, 201])));

      await test.step('GET /DoctorAdviceReferences/{id} returns it', async () => {
        expect((await doctorAdviceRefs.getById(id)).expectStatus(200).descriptionEn).toBe(body.descriptionEn);
      });

      await test.step('PUT /DoctorAdviceReferences/{id} updates it', async () => {
        const descriptionEn = `${body.descriptionEn} (updated)`;
        (await doctorAdviceRefs.update(id, { descriptionEn, descriptionBn: body.descriptionBn })).expectStatus(200);
        expect((await doctorAdviceRefs.getById(id)).expectStatus(200).descriptionEn).toBe(descriptionEn);
      });

      await test.step('DELETE /DoctorAdviceReferences/{id} removes it', async () => {
        (await doctorAdviceRefs.remove(id)).expectStatus([200, 204]);
      });
    });
  });

  test('POST + DELETE /DoctorAdviceReferences/bulk @crud', async ({ doctorAdviceRefs }) => {
    const items = [doctorRef.advice(doctorId!), doctorRef.advice(doctorId!)].map(({ doctorId: _, ...i }) => i);
    const created = (await doctorAdviceRefs.bulkCreate(doctorId!, items)).expectStatus([200, 201]);
    const ids = (Array.isArray(created) ? created : created.items).map((x: any) => extractId(x));
    expect(ids).toHaveLength(2);
    (await doctorAdviceRefs.bulkDelete(ids)).expectStatus([200, 204]);
  });
});

test('requests without a token return 401', async ({ anon }) => {
  (await anon(DoctorAdviceReferencesApi).list()).expectUnauthorized();
});

test.describe('DoctorAdviceReferences - edge cases', () => {
  test.skip(!doctorId, NEED_DOCTOR);
  // Records the API wrongly accepts are deleted after the test (guaranteed cleanup).
  const withoutDoctor = () => { const { doctorId: _, ...rest } = doctorRef.advice(doctorId!); return rest; };

  test('GET, PUT and DELETE with an unknown id return 404', async ({ doctorAdviceRefs }) => {
    const id = crypto.randomUUID();
    (await doctorAdviceRefs.getById(id)).expectNotFound();
    (await doctorAdviceRefs.update(id, withoutDoctor())).expectNotFound();
    (await doctorAdviceRefs.remove(id)).expectNotFound();
  });

  test('POST without a token returns 401', async ({ anon }) => {
    (await anon(DoctorAdviceReferencesApi).create(doctorRef.advice(doctorId!))).expectUnauthorized();
  });
});

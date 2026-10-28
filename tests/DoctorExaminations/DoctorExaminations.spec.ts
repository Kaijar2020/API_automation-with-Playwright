import { test, expect } from '@fixtures';
import { DoctorExaminationsApi } from '@api/index';
import { doctorRef } from '@data/payloads';
import { extractId } from '@utils/data';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

// Swagger tag: DoctorExaminations (a doctor's personalised examination notes)

test.describe('Doctor examinations', () => {
  test.skip(!doctorId, NEED_DOCTOR);

  test('GET /DoctorExaminations lists the doctor notes @smoke', async ({ doctorExaminations }) => {
    (await doctorExaminations.list(doctorId)).expectStatus(200);
  });

  test('GET /DoctorExaminations/get-all-by-doctorId pages the doctor notes @smoke', async ({ doctorExaminations }) => {
    const data = (await doctorExaminations.getAllByDoctorId({ doctorId, pageSize: 5 })).expectStatus(200);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test.describe('CRUD @crud', () => {
    test('create, read, update and delete a personalised note', async ({ doctorExaminations }) => {
      const body = doctorRef.examination(doctorId!);

      const id = await test.step('POST /DoctorExaminations creates a personalised note', async () =>
        extractId((await doctorExaminations.create(body)).expectStatus([200, 201])));

      await test.step('GET /DoctorExaminations/{id} returns it', async () => {
        expect((await doctorExaminations.getById(id)).expectStatus(200).clinicalNoteEn).toBe(body.clinicalNoteEn);
      });

      await test.step('PUT /DoctorExaminations/{id} updates it', async () => {
        const clinicalNoteEn = `${body.clinicalNoteEn} (updated)`;
        (await doctorExaminations.update(id, { clinicalNoteEn, clinicalNoteBn: body.clinicalNoteBn })).expectStatus(200);
        expect((await doctorExaminations.getById(id)).expectStatus(200).clinicalNoteEn).toBe(clinicalNoteEn);
      });

      await test.step('DELETE /DoctorExaminations/{id} removes it', async () => {
        (await doctorExaminations.remove(id)).expectStatus([200, 204]);
      });
    });
  });

  test('POST + DELETE /DoctorExaminations/bulk @crud', async ({ doctorExaminations }) => {
    const items = [doctorRef.examination(doctorId!), doctorRef.examination(doctorId!)].map(({ doctorId: _, ...i }) => i);
    const created = (await doctorExaminations.bulkCreate(doctorId!, items)).expectStatus([200, 201]);
    const ids = (Array.isArray(created) ? created : created.items).map((x: any) => extractId(x));
    expect(ids).toHaveLength(2);
    (await doctorExaminations.bulkDelete(ids)).expectStatus([200, 204]);
  });
});

test('requests without a token return 401', async ({ anon }) => {
  (await anon(DoctorExaminationsApi).list()).expectUnauthorized();
});

test.describe('DoctorExaminations - edge cases', () => {
  test.skip(!doctorId, NEED_DOCTOR);
  // Records the API wrongly accepts are deleted after the test (guaranteed cleanup).
  const withoutDoctor = () => { const { doctorId: _, ...rest } = doctorRef.examination(doctorId!); return rest; };

  test('GET, PUT and DELETE with an unknown id return 404', async ({ doctorExaminations }) => {
    const id = crypto.randomUUID();
    (await doctorExaminations.getById(id)).expectNotFound();
    (await doctorExaminations.update(id, withoutDoctor())).expectNotFound();
    (await doctorExaminations.remove(id)).expectNotFound();
  });

  test('POST without doctorId returns 400', async ({ doctorExaminations }) => {
    (await doctorExaminations.create(withoutDoctor())).expectValidationError('doctorId');
  });

  test('POST /bulk with no items returns 400', async ({ doctorExaminations }) => {
    (await doctorExaminations.bulkCreate(doctorId!, [])).expectValidationError('items');
  });

  test('POST without a token returns 401', async ({ anon }) => {
    (await anon(DoctorExaminationsApi).create(doctorRef.examination(doctorId!))).expectUnauthorized();
  });
});

import { test, expect } from '@fixtures';
import { DoctorDiagnosesReferencesApi } from '@api/index';
import { doctorRef } from '@data/payloads';
import { extractId } from '@utils/data';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

// Swagger tag: DoctorDiagnosesReferences (a doctor's personalised diagnoses)

test.describe('Doctor diagnoses references', () => {
  test.skip(!doctorId, NEED_DOCTOR);

  test('GET /DoctorDiagnosesReferences lists the doctor diagnoses @smoke', async ({ doctorDiagnosesRefs }) => {
    (await doctorDiagnosesRefs.list(doctorId)).expectStatus(200);
  });

  test('GET /DoctorDiagnosesReferences/get-all-by-doctorId pages the doctor diagnoses @smoke', async ({ doctorDiagnosesRefs }) => {
    const data = (await doctorDiagnosesRefs.getAllByDoctorId({ doctorId, pageSize: 5 })).expectStatus(200);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test.describe('CRUD @crud', () => {
    test('create, read, update and delete a personalised diagnosis', async ({ doctorDiagnosesRefs }) => {
      const body = doctorRef.diagnosis(doctorId!);

      const id = await test.step('POST /DoctorDiagnosesReferences creates a personalised diagnosis', async () =>
        extractId((await doctorDiagnosesRefs.create(body)).expectStatus([200, 201])));

      await test.step('GET /DoctorDiagnosesReferences/{id} returns it', async () => {
        expect((await doctorDiagnosesRefs.getById(id)).expectStatus(200).name).toBe(body.name);
      });

      await test.step('PUT /DoctorDiagnosesReferences/{id} updates it', async () => {
        const { doctorId: _, ...rest } = body;
        const name = `${body.name} (updated)`;
        (await doctorDiagnosesRefs.update(id, { ...rest, name })).expectStatus(200);
        expect((await doctorDiagnosesRefs.getById(id)).expectStatus(200).name).toBe(name);
      });

      await test.step('DELETE /DoctorDiagnosesReferences/{id} removes it', async () => {
        (await doctorDiagnosesRefs.remove(id)).expectStatus([200, 204]);
      });
    });
  });

  test('POST + DELETE /DoctorDiagnosesReferences/bulk @crud', async ({ doctorDiagnosesRefs }) => {
    const items = [doctorRef.diagnosis(doctorId!), doctorRef.diagnosis(doctorId!)].map(({ doctorId: _, ...i }) => i);
    const created = (await doctorDiagnosesRefs.bulkCreate(doctorId!, items)).expectStatus([200, 201]);
    const ids = (Array.isArray(created) ? created : created.items).map((x: any) => extractId(x));
    expect(ids).toHaveLength(2);
    (await doctorDiagnosesRefs.bulkDelete(ids)).expectStatus([200, 204]);
  });
});

test('requests without a token return 401', async ({ anon }) => {
  (await anon(DoctorDiagnosesReferencesApi).list()).expectUnauthorized();
});

test.describe('DoctorDiagnosesReferences - edge cases', () => {
  test.skip(!doctorId, NEED_DOCTOR);
  // Records the API wrongly accepts are deleted after the test (guaranteed cleanup).
  const withoutDoctor = () => { const { doctorId: _, ...rest } = doctorRef.diagnosis(doctorId!); return rest; };

  test('GET, PUT and DELETE with an unknown id return 404', async ({ doctorDiagnosesRefs }) => {
    const id = crypto.randomUUID();
    (await doctorDiagnosesRefs.getById(id)).expectNotFound();
    (await doctorDiagnosesRefs.update(id, withoutDoctor())).expectNotFound();
    (await doctorDiagnosesRefs.remove(id)).expectNotFound();
  });

  test('POST without a token returns 401', async ({ anon }) => {
    (await anon(DoctorDiagnosesReferencesApi).create(doctorRef.diagnosis(doctorId!))).expectUnauthorized();
  });
});

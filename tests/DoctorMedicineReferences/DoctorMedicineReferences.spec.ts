import { test, expect } from '@fixtures';
import { DoctorMedicineReferencesApi } from '@api/index';
import { doctorRef } from '@data/payloads';
import { extractId } from '@utils/data';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

// Swagger tag: DoctorMedicineReferences (a doctor's personalised medicines; the key is medicineId, not id)

test.describe('Doctor medicine references', () => {
  test.skip(!doctorId, NEED_DOCTOR);

  test('GET /DoctorMedicineReferences lists the doctor medicines @smoke', async ({ doctorMedicineRefs }) => {
    (await doctorMedicineRefs.list(doctorId)).expectStatus(200);
  });

  test('GET /DoctorMedicineReferences/get-all-by-doctorId pages the doctor medicines @smoke', async ({ doctorMedicineRefs }) => {
    const data = (await doctorMedicineRefs.getAllByDoctorId({ doctorId, pageSize: 5 })).expectStatus(200);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test('GET /DoctorMedicineReferences/medicine/{id} returns a catalog medicine', async ({ doctorMedicineRefs, medicines }) => {
    const [first] = (await medicines.getAll({ pageSize: 1 })).expectStatus(200);
    (await doctorMedicineRefs.getMedicine(first.medicineId, doctorId, false)).expectStatus(200);
  });

  test('GET /DoctorMedicineReferences/medicine/{id} with unknown id returns 404', async ({ doctorMedicineRefs }) => {
    (await doctorMedicineRefs.getMedicine(crypto.randomUUID(), doctorId, false)).expectNotFound();
  });

  test.describe('CRUD @crud', () => {
    test('create, read, update and delete a personalised medicine', async ({ doctorMedicineRefs }) => {
      const body = doctorRef.medicine(doctorId!);

      const id = await test.step('POST /DoctorMedicineReferences creates a personalised medicine', async () =>
        extractId((await doctorMedicineRefs.create(body)).expectStatus([200, 201]), 'medicineId'));

      await test.step('GET /DoctorMedicineReferences/{id} returns it', async () => {
        expect((await doctorMedicineRefs.getById(id)).expectStatus(200).brandName).toBe(body.brandName);
      });

      await test.step('PUT /DoctorMedicineReferences/{id} updates it', async () => {
        const { doctorId: _, ...rest } = body;
        (await doctorMedicineRefs.update(id, { ...rest, strength: '650 mg' })).expectStatus(200);
        expect((await doctorMedicineRefs.getById(id)).expectStatus(200).strength).toBe('650 mg');
      });

      await test.step('DELETE /DoctorMedicineReferences/{id} removes it', async () => {
        (await doctorMedicineRefs.remove(id)).expectStatus([200, 204]);
      });
    });
  });

  test('POST + DELETE /DoctorMedicineReferences/bulk @crud', async ({ doctorMedicineRefs }) => {
    const items = [doctorRef.medicine(doctorId!), doctorRef.medicine(doctorId!)].map(({ doctorId: _, ...i }) => i);
    const created = (await doctorMedicineRefs.bulkCreate(doctorId!, items)).expectStatus([200, 201]);
    const ids = (Array.isArray(created) ? created : created.items).map((x: any) => extractId(x, 'medicineId'));
    expect(ids).toHaveLength(2);
    (await doctorMedicineRefs.bulkDelete(ids)).expectStatus([200, 204]);
  });
});

test('requests without a token return 401', async ({ anon }) => {
  (await anon(DoctorMedicineReferencesApi).list()).expectUnauthorized();
});

test.describe('DoctorMedicineReferences - edge cases', () => {
  test.skip(!doctorId, NEED_DOCTOR);
  // Records the API wrongly accepts are deleted after the test (guaranteed cleanup).
  const withoutDoctor = () => { const { doctorId: _, ...rest } = doctorRef.medicine(doctorId!); return rest; };

  test('GET, PUT and DELETE with an unknown id return 404', async ({ doctorMedicineRefs }) => {
    const id = crypto.randomUUID();
    (await doctorMedicineRefs.getById(id)).expectNotFound();
    (await doctorMedicineRefs.update(id, withoutDoctor())).expectNotFound();
    (await doctorMedicineRefs.remove(id)).expectNotFound();
  });

  test('POST without doctorId returns 400', async ({ doctorMedicineRefs }) => {
    (await doctorMedicineRefs.create(withoutDoctor())).expectValidationError('doctorId');
  });

  test('POST /bulk with no items returns 400', async ({ doctorMedicineRefs }) => {
    (await doctorMedicineRefs.bulkCreate(doctorId!, [])).expectValidationError('items');
  });

  test('POST without a token returns 401', async ({ anon }) => {
    (await anon(DoctorMedicineReferencesApi).create(doctorRef.medicine(doctorId!))).expectUnauthorized();
  });
});

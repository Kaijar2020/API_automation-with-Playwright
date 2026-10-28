import { test, expect } from '@fixtures';
import { DoctorInvestigationReferencesApi } from '@api/index';
import { doctorRef } from '@data/payloads';
import { extractId } from '@utils/data';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

// Swagger tag: DoctorInvestigationReferences (a doctor's personalised tests; ids are integers)

test.describe('Doctor investigation references', () => {
  test.skip(!doctorId, NEED_DOCTOR);

  test('GET /DoctorInvestigationReferences lists the doctor tests @smoke', async ({ doctorInvestigationRefs }) => {
    (await doctorInvestigationRefs.list(doctorId)).expectStatus(200);
  });

  test('GET /DoctorInvestigationReferences/get-all-by-doctorId pages the doctor tests @smoke', async ({ doctorInvestigationRefs }) => {
    const data = (await doctorInvestigationRefs.getAllByDoctorId({ doctorId, pageSize: 5 })).expectStatus(200);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test('GET /DoctorInvestigationReferences/get-all-test-by-panelId returns a panel', async ({ doctorInvestigationRefs, investigations }) => {
    const [panel] = (await investigations.getPanels({ pageSize: 1 })).expectStatus(200);
    (await doctorInvestigationRefs.getAllTestsByPanelId(panel.id ?? panel.panelId, doctorId)).expectStatus(200);
  });

  test.describe('CRUD @crud', () => {
    test('create, read, update and delete a personalised test', async ({ doctorInvestigationRefs }) => {
      const body = doctorRef.investigation(doctorId!);

      const id = await test.step('POST /DoctorInvestigationReferences creates a personalised test', async () =>
        extractId((await doctorInvestigationRefs.create(body)).expectStatus([200, 201])));

      await test.step('GET /DoctorInvestigationReferences/{id} returns it', async () => {
        expect((await doctorInvestigationRefs.getById(id)).expectStatus(200).name).toBe(body.name);
      });

      await test.step('PUT /DoctorInvestigationReferences/{id} updates it', async () => {
        const { doctorId: _, ...rest } = body;
        const name = `${body.name} (updated)`;
        (await doctorInvestigationRefs.update(id, { ...rest, name })).expectStatus(200);
        expect((await doctorInvestigationRefs.getById(id)).expectStatus(200).name).toBe(name);
      });

      await test.step('DELETE /DoctorInvestigationReferences/{id} removes it', async () => {
        (await doctorInvestigationRefs.remove(id)).expectStatus([200, 204]);
      });
    });
  });
});

test.describe('Doctor investigation references - negative', () => {
  test('get-all-test-by-panelId without panelId returns 404', async ({ doctorInvestigationRefs }) => {
    // Swagger marks panelId optional, but the API requires it.
    (await doctorInvestigationRefs.get('/DoctorInvestigationReferences/get-all-test-by-panelId')).expectNotFound();
  });

  test('requests without a token return 401', async ({ anon }) => {
    (await anon(DoctorInvestigationReferencesApi).list()).expectUnauthorized();
  });
});

test.describe('DoctorInvestigationReferences - edge cases', () => {
  test.skip(!doctorId, NEED_DOCTOR);
  // Records the API wrongly accepts are deleted after the test (guaranteed cleanup).
  const withoutDoctor = () => { const { doctorId: _, ...rest } = doctorRef.investigation(doctorId!); return rest; };

  test('GET, PUT and DELETE with an unknown id return 404', async ({ doctorInvestigationRefs }) => {
    const id = 987654321;
    (await doctorInvestigationRefs.getById(id)).expectNotFound();
    (await doctorInvestigationRefs.update(id, withoutDoctor())).expectNotFound();
    (await doctorInvestigationRefs.remove(id)).expectNotFound();
  });

  test('POST without a token returns 401', async ({ anon }) => {
    (await anon(DoctorInvestigationReferencesApi).create(doctorRef.investigation(doctorId!))).expectUnauthorized();
  });
});

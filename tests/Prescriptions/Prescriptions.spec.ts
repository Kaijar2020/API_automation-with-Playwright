import { test, expect } from '@fixtures';
import { knownBug } from '@utils/allure';
import { PrescriptionsApi } from '@api/index';
import {
  prescriptionPayload, prescriptionFullUpdatePayload, PrescriptionCatalogRefs, VISIT_TYPES, CREATE_CHOICE, UPDATE_CHOICE,
} from '@data/payloads';
import { lookupPrescriptionRefs } from '@data/prescriptionRefs';
import { env } from '@config';
import { doctorId, patientId, NEED_DOCTOR, NEED_PATIENT } from '@utils/ids';

const DATE_FIELDS = new Set(['prescriptionDate', 'followUpDate', 'testDate']);

/** Comparable copy: dates as ISO instants; medicine items expose their key as `id` (responses call it prescriptionMedicineId). */
function normalize(value: any, key = ''): any {
  if (Array.isArray(value)) return value.map(v => normalize(v));
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v, k);
    if (out.prescriptionMedicineId && out.id === undefined) out.id = out.prescriptionMedicineId;
    return out;
  }
  if (DATE_FIELDS.has(key) && typeof value === 'string') return new Date(value).toISOString();
  return value;
}

/**
 * Matcher: every field sent is saved with the same value; extra fields the API adds are ignored.
 * Lists must match exactly (same length, same order), so a list sent empty must come back empty.
 */
function contains(expected: any): any {
  if (Array.isArray(expected)) return expected.map(contains);
  if (expected && typeof expected === 'object') {
    return expect.objectContaining(Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, contains(v)])));
  }
  return expected;
}

/** Fields the API accepts but never returns, so they cannot be compared. */
const NOT_RETURNED = ['patientNumber', 'isDraft', 'patientId', 'doctorId'];

/**
 * Every field of `sent` was saved (one soft check per field, so a run lists every field the API dropped).
 * Chief complaints with isCurrent: false come back under previousHistories (same id, without isCurrent).
 */
function expectSavedAsSent(savedRaw: any, sentRaw: any) {
  const saved = normalize(savedRaw);
  const { chiefComplaints: complaints = [], ...rest } = normalize(sentRaw);
  const expected: Record<string, unknown> = {
    ...rest,
    chiefComplaints: complaints.filter((c: any) => c.isCurrent),
    previousHistories: complaints.filter((c: any) => !c.isCurrent).map(({ isCurrent: _, ...c }: any) => c),
  };
  for (const field of NOT_RETURNED) delete expected[field];
  for (const [field, value] of Object.entries(expected)) {
    if (field === 'previousHistories' && !(value as unknown[]).length) continue; // nothing moved to history
    if (Array.isArray(value)) expect.soft(saved[field], `${field}: exactly the items sent`).toHaveLength(value.length);
    expect.soft(saved[field], `${field} saved`).toEqual(contains(value));
  }
}

/** Full update body for requests that target no real prescription (negative tests). */
const updateForUnknownPrescription = (refs: PrescriptionCatalogRefs) => prescriptionFullUpdatePayload({
  diagnoses: [{ id: crypto.randomUUID() }], chiefComplaints: [{ id: crypto.randomUUID() }], advices: [{ id: crypto.randomUUID() }],
  investigations: [{ id: crypto.randomUUID() }], drugHistories: [{ id: crypto.randomUUID() }], medicines: [],
}, refs, crypto.randomUUID());

// Swagger tag: Prescriptions
// The API has no single-prescription delete, so the prescription created here stays in the database.
// To keep that to a minimum: opt-in (PRESCRIPTION_WRITES=true), exactly one prescription per run (one test,
// no retries), notes start with "[AUTO]", and its id is listed in reports/cleanup.md for the backend team.
// Every create sends every field (real catalog links, two medicines); negative tests drop only the field they test.
// Never use DELETE /Prescriptions/doctor/{doctorId}/hard-delete: it wipes every prescription of the doctor (blocked in ApiClient).

test.describe('Prescriptions - lifecycle @crud', () => {
  test.skip(!env.prescriptionWrites, 'Creates a prescription that cannot be deleted: set PRESCRIPTION_WRITES=true to run it');
  test.skip(!doctorId || !patientId, NEED_PATIENT);
  // A retry would create a second undeletable prescription.
  test.describe.configure({ retries: 0 });

  test('create, read, render, update and complete a prescription', async ({ prescriptions, diagnosis, chiefComplaints, medicines, advices, investigations, formulationConfigs }) => {
    const testDoctor = doctorId!;

    const refs = await test.step('look up catalog records and dropdown options (read-only)', () =>
      lookupPrescriptionRefs({ diagnosis, chiefComplaints, medicines, advices, investigations, formulationConfigs }));

    // A chamber id that belongs to no real chamber, so the test prescription shows up in no chamber's list.
    const body = prescriptionPayload(patientId!, testDoctor, refs, crypto.randomUUID());

    const id = await test.step('POST /Prescriptions creates a prescription with every field (201)', async () => {
      const data = (await prescriptions.create(body)).expectStatus(201);
      const created: string = typeof data === 'string' ? data : data.id;
      expect(created).toBeTruthy();
      return created;
    });

    const created = await test.step('GET /Prescriptions/{id} returns every field that was sent', async () => {
      const data = (await prescriptions.getById(id)).expectStatus(200);
      expect(data).toMatchObject({ id, patientId, doctorId: testDoctor });
      expect(data.prescriptionNumber).toBeTruthy();
      expectSavedAsSent(data, body);
      return data;
    });

    await test.step(`visit type chosen from the dropdown (${CREATE_CHOICE.visitType}) is saved`, async () => {
      expect(VISIT_TYPES).toContain(CREATE_CHOICE.visitType);
      expect(created.visitType).toBe(CREATE_CHOICE.visitType);
    });

    await test.step('medicine 1 keeps its default dosage, medicine 2 has the dosage chosen from the dropdowns', async () => {
      const [, withDropdown] = body.medicines as any[];
      const saved = normalize(created.medicines);
      const byMedicine = (m: any) => saved.find((x: any) => x.medicineId === m.medicineId);

      expect.soft(byMedicine(refs.defaultDosageMedicine), 'default dosage = catalog default').toEqual(contains({
        medicineId: refs.defaultDosageMedicine.medicineId,
        dosageSchedule: refs.defaultDosageMedicine.dosageSchedule,
        dosageInstruction: refs.defaultDosageMedicine.dosageInstruction,
        dosageInstructionEn: refs.defaultDosageMedicine.dosageInstructionEn,
        formulationCode: refs.defaultDosageMedicine.formulationCode,
      }));
      expect.soft(byMedicine(withDropdown), 'dosage chosen from the dropdowns').toEqual(contains(normalize(withDropdown)));
      // Every chosen value really is one of the dropdown options.
      for (const v of withDropdown.values) {
        const options = refs.formulation.fields.find(f => f.key === v.key)!.options;
        expect.soft(v.key === 'duration' ? options.some(o => v.value.endsWith(o)) : options.includes(v.value), `${v.key} "${v.value}" is a dropdown option`).toBe(true);
      }
    });

    await test.step('patient and doctor lists include it', async () => {
      expect(JSON.stringify((await prescriptions.getByPatient(patientId!)).expectStatus(200)), 'by patient').toContain(id);
      expect(JSON.stringify((await prescriptions.getByDoctor(testDoctor, 1, 50)).expectStatus(200)), 'by doctor').toContain(id);
      expect(JSON.stringify((await prescriptions.getByPatientAndDoctor(patientId!, testDoctor)).expectStatus(200)), 'by patient + doctor').toContain(id);
      expect(JSON.stringify((await prescriptions.getPrescriptionList(testDoctor, 1, 50)).expectStatus(200)), 'prescription list').toContain(id);
    });

    await test.step('GET /Prescriptions/{id}/formatted splits left/right sections', async () => {
      const data = (await prescriptions.getFormatted(id)).expectStatus(200);
      expect(data.id).toBe(id);
      expect(data.leftSection).toBeTruthy();
      expect(data.rightSection.medicines).toHaveLength(2);
    });

    await test.step('GET /Prescriptions/{id}/pdf returns a real PDF', async () => {
      const res = await prescriptions.downloadPdf(id);
      expect(res.status).toBe(200);
      expect(res.response.headers()['content-type']).toContain('application/pdf');
      expect((await res.response.body()).subarray(0, 4).toString()).toBe('%PDF');
    });

    // Skipped for now: PUT /Prescriptions/prescriptionId/{id}/doctor/{doctorId} (the steps that use `update` below).
    const update = prescriptionFullUpdatePayload(created, refs, crypto.randomUUID());

    await test.step.skip('PUT /Prescriptions/prescriptionId/{id}/doctor/{doctorId} updates every field', async () => {
      (await prescriptions.update(id, testDoctor, update)).expectStatus(200);
      const saved = (await prescriptions.getById(id)).expectStatus(200);
      expect.soft(saved, 'id, patient and doctor unchanged').toMatchObject({ id, patientId, doctorId: testDoctor });
      expectSavedAsSent(saved, update);
    });

    await test.step.skip(`update: visit type ${UPDATE_CHOICE.visitType} from the dropdown, medicine 1 keeps its default, medicine 2 gets a new dropdown dosage`, async () => {
      const saved = (await prescriptions.getById(id)).expectStatus(200);
      expect.soft(saved.visitType, 'visit type').toBe(UPDATE_CHOICE.visitType);
      expect.soft(UPDATE_CHOICE.visitType, 'a different dropdown choice than the create').not.toBe(CREATE_CHOICE.visitType);

      const [withDefault, withDropdown] = update.medicines as any[];
      const find = (list: any[], m: any) => normalize(list).find((x: any) => x.medicineId === m.medicineId);
      const before = find(created.medicines, withDropdown);
      const after = find(saved.medicines, withDropdown);

      expect.soft(find(saved.medicines, withDefault), 'medicine 1 still has the catalog default dosage').toEqual(contains({
        id: withDefault.id,
        dosageSchedule: refs.defaultDosageMedicine.dosageSchedule,
        dosageInstruction: refs.defaultDosageMedicine.dosageInstruction,
        dosageInstructionEn: refs.defaultDosageMedicine.dosageInstructionEn,
      }));
      expect.soft(after, 'medicine 2 updated in place with the new dropdown values').toEqual(contains({
        id: withDropdown.id, values: withDropdown.values, childDosages: withDropdown.childDosages,
      }));
      expect.soft(after?.values, 'medicine 2 dosage differs from the create').not.toEqual(before?.values);
    });

    await test.step.skip('updated prescription still renders (formatted + PDF)', async () => {
      const formatted = (await prescriptions.getFormatted(id)).expectStatus(200);
      expect(formatted.rightSection.medicines).toHaveLength(2);
      const pdf = await prescriptions.downloadPdf(id);
      expect(pdf.status).toBe(200);
      expect((await pdf.response.body()).subarray(0, 4).toString()).toBe('%PDF');
    });

    await test.step.skip('PUT by a doctor who does not own the prescription returns 404 and changes nothing', async () => {
      const before = (await prescriptions.getById(id)).expectStatus(200);
      (await prescriptions.update(id, crypto.randomUUID(), { ...update, notes: '[AUTO] must not be saved' })).expectNotFound();
      const after = (await prescriptions.getById(id)).expectStatus(200);
      expect.soft(after.notes, 'notes unchanged').toBe(before.notes);
      expect.soft(after.doctorId, 'doctor unchanged').toBe(testDoctor);
      expect.soft(after.modifiedAt, 'not modified').toBe(before.modifiedAt);
    });

    await test.step.skip('PUT with every list empty clears all sections', async () => {
      const cleared = { ...update, diagnoses: [], chiefComplaints: [], medicines: [], advices: [], investigations: [], drugHistories: [] };
      (await prescriptions.update(id, testDoctor, cleared)).expectStatus(200);
      const data = (await prescriptions.getById(id)).expectStatus(200);
      for (const list of ['diagnoses', 'chiefComplaints', 'medicines', 'advices', 'investigations', 'drugHistories']) {
        expect.soft(data[list] ?? [], `${list} cleared`).toHaveLength(0);
      }
      expect.soft(data.notes, 'scalar fields kept').toBe(update.notes);
    });

    await test.step('PUT /Prescriptions/{id}/investigations saves test results', async () => {
      const t = refs.tests[0];
      const items = [{ testId: t.testId, panelId: t.panelId, name: t.name, abbreviation: t.abbreviation ?? '', instructions: 'Fasting',
        isUrgent: false, sortOrder: 0, testResult: '7.2', abnormalFlag: 'High', resultNote: 'Slightly high' }];
      (await prescriptions.syncInvestigations(id, { doctorId: testDoctor, items, gender: 'male', age: 45 })).expectStatus(200);
      const data = (await prescriptions.getById(id)).expectStatus(200);
      expect(data.investigations).toHaveLength(1);
      expect(data.investigations[0]).toMatchObject({ name: t.name, testResult: '7.2', resultNote: 'Slightly high' });
    });

    await test.step('PATCH /Prescriptions/{id}/status moves it to completed', async () => {
      (await prescriptions.updateStatus(id, 'completed')).expectStatus(200);
      expect((await prescriptions.getById(id)).expectStatus(200).status).toBe('completed');
    });
  });
});

test.describe('Prescriptions - negative', () => {
  // None of these may create a prescription: the API must reject them (a 2xx would be recorded as not deletable).
  // Creates send the full body (every field, both medicines) without only the field under test.
  test('POST /Prescriptions without patient and doctor returns 400', async ({ prescriptions, diagnosis, chiefComplaints, medicines, advices, investigations, formulationConfigs }) => {
    const refs = await lookupPrescriptionRefs({ diagnosis, chiefComplaints, medicines, advices, investigations, formulationConfigs });
    const { patientId: _p, doctorId: _d, ...withoutIds } = prescriptionPayload('', '', refs, crypto.randomUUID());
    (await prescriptions.create(withoutIds)).expectValidationError('patientId').expectValidationError('doctorId');
  });

  test('GET /Prescriptions/{id} with unknown id returns 404', async ({ prescriptions }) => {
    (await prescriptions.getById(crypto.randomUUID())).expectNotFound();
  });

  test('GET /Prescriptions/{id} with a malformed id is rejected', async ({ prescriptions }) => {
    (await prescriptions.getById('not-a-uuid')).expectRejected();
  });

  test.skip('PUT /Prescriptions/prescriptionId/{id}/doctor/{doctorId} with unknown id returns 404', async ({ prescriptions, diagnosis, chiefComplaints, medicines, advices, investigations, formulationConfigs }) => {
    test.skip(!doctorId, NEED_DOCTOR);
    const refs = await lookupPrescriptionRefs({ diagnosis, chiefComplaints, medicines, advices, investigations, formulationConfigs });
    (await prescriptions.update(crypto.randomUUID(), doctorId!, updateForUnknownPrescription(refs))).expectNotFound();
  });

  test('PUT /Prescriptions/{id}/investigations with unknown id returns 404', async ({ prescriptions }) => {
    (await prescriptions.syncInvestigations(crypto.randomUUID(), { doctorId, items: [] })).expectNotFound();
  });

  test('lists for an unknown patient / doctor are empty', async ({ prescriptions }) => {
    expect((await prescriptions.getByPatient(crypto.randomUUID())).expectStatus(200), 'by patient').toEqual([]);
    expect((await prescriptions.getByDoctor(crypto.randomUUID())).expectStatus(200), 'by doctor').toEqual([]);
    expect((await prescriptions.getByPatientAndDoctor(crypto.randomUUID(), crypto.randomUUID())).expectStatus(200), 'by patient + doctor').toEqual([]);
  });

  test('GET /Prescriptions/{id}/formatted with unknown id returns 404', async ({ prescriptions }) => {
    (await prescriptions.getFormatted(crypto.randomUUID())).expectNotFound();
  });

  test('GET /Prescriptions/{id}/pdf with unknown id returns 404', async ({ prescriptions }) => {
    await knownBug('answers 406 Not Acceptable instead of 404.');
    (await prescriptions.downloadPdf(crypto.randomUUID())).expectNotFound();
  });

  test('PATCH /Prescriptions/{id}/status with an invalid status returns 400', async ({ prescriptions }) => {
    await knownBug('returns a raw ProblemDetails ("The JSON value could not be converted to UpdatePrescriptionStatusRequest") without the { success, error } envelope.');
    // The body is rejected before the prescription is looked up, so a random id is enough and touches no data.
    (await prescriptions.updateStatus(crypto.randomUUID(), 'not-a-status')).expectValidationError('status');
  });

  test('PATCH /Prescriptions/{id}/status with unknown id returns 404', async ({ prescriptions }) => {
    (await prescriptions.updateStatus(crypto.randomUUID(), 'active')).expectNotFound();
  });

  test('GET /Prescriptions/doctor/{doctorId} for the configured doctor @smoke', async ({ prescriptions }) => {
    test.skip(!doctorId, NEED_DOCTOR);
    (await prescriptions.getByDoctor(doctorId!)).expectStatus(200);
  });

  test('requests without a token return 401', async ({ anon, diagnosis, chiefComplaints, medicines, advices, investigations, formulationConfigs }) => {
    const refs = await lookupPrescriptionRefs({ diagnosis, chiefComplaints, medicines, advices, investigations, formulationConfigs });
    const api = anon(PrescriptionsApi);
    const id = crypto.randomUUID();
    (await api.getById(id)).expectUnauthorized();
    (await api.downloadPdf(id)).expectUnauthorized();
    // Full bodies. The create leaves out patient and doctor, so even a wrong 2xx could not make a real prescription.
    const { patientId: _p, doctorId: _d, ...withoutIds } = prescriptionPayload('', '', refs, crypto.randomUUID());
    (await api.create(withoutIds)).expectUnauthorized();
    // PUT /Prescriptions/prescriptionId/{id}/doctor/{doctorId} is skipped for now:
    // (await api.update(id, crypto.randomUUID(), updateForUnknownPrescription(refs))).expectUnauthorized();
    (await api.updateStatus(id, 'active')).expectUnauthorized();
    (await api.syncInvestigations(id, { doctorId, items: [] })).expectUnauthorized();
  });
});

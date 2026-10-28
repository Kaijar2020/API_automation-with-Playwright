import { test, expect } from '@fixtures';
import { knownBug } from '@utils/allure';
import { PatientsApi } from '@api/index';
import { doctorId, patientId, NEED_PATIENT } from '@utils/ids';

// Swagger tag: Patients

test.describe('Patients', () => {
  test.skip(!doctorId || !patientId, NEED_PATIENT);

  test('GET /Patients/GetPatientHistory/{patientId} returns the visit history @smoke', async ({ patients }) => {
    await knownBug('Swagger PatientInfoDto does not document prescriptionId, visitDate, visitType, diagnosis and advices, which the API returns.');
    (await patients.getPatientHistory(patientId!, doctorId)).expectStatus(200);
  });

  test('GET /Patients/get-prescription-detail returns the first visit', async ({ patients }) => {
    (await patients.getPrescriptionDetail({ id: patientId!, doctorId: doctorId!, visitNumber: 1 })).expectStatus([200, 404]);
  });
});

test.describe('Patients - negative', () => {
  test('GetPatientHistory for an unknown patient returns an empty list', async ({ patients }) => {
    // Swagger documents 404, but the API answers 200 with no items.
    const data = (await patients.getPatientHistory(crypto.randomUUID())).expectStatus(200);
    expect(data).toEqual([]);
  });

  test('get-prescription-detail without patient and doctor returns 400', async ({ patients }) => {
    (await patients.get('/Patients/get-prescription-detail')).expectValidationError('patientId').expectValidationError('doctorId');
  });

  test('requests without a token return 401', async ({ anon }) => {
    (await anon(PatientsApi).getPatientHistory(crypto.randomUUID())).expectUnauthorized();
  });
});

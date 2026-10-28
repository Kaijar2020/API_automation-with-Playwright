import { test, expect } from '@fixtures';
import { knownBug } from '@utils/allure';
import { DoctorDashboardApi } from '@api/index';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

// Swagger tag: DoctorDashboard
// Swagger documents DurationType as "lastSevenDays" etc., but the API only accepts the numeric value
// and returns the name in the response.
const DURATIONS = [
  { value: '1', name: 'lastSevenDays' },
  { value: '2', name: 'lastThirtyDays' },
  { value: '3', name: 'lastThreeMonths' },
];

test.describe('Doctor dashboard @smoke', () => {
  test.skip(!doctorId, NEED_DOCTOR);

  test('GET /dashboard/doctors/{doctorId}/prescription-analysis returns totals', async ({ dashboard }) => {
    const data = (await dashboard.prescriptionAnalysis(doctorId!)).expectStatus(200);
    expect(data.doctorId).toBe(doctorId);
    expect(data.totalPrescriptions).toBeGreaterThanOrEqual(0);
    expect(data.todaysEncounterCount).toBeGreaterThanOrEqual(0);
  });

  test('encounters default to the last seven days', async ({ dashboard }) => {
    const data = (await dashboard.encounters(doctorId!)).expectStatus(200);
    expect(data.durationType).toBe('lastSevenDays');
    expect(data.dataPoints).toHaveLength(7);
  });

  for (const d of DURATIONS) {
    test(`GET /dashboard/doctors/{doctorId}/encounters for ${d.name}`, async ({ dashboard }) => {
      const data = (await dashboard.encounters(doctorId!, d.value)).expectStatus(200);
      expect(data.durationType).toBe(d.name);
      for (const p of data.dataPoints) expect(new Date(p.periodEnd) > new Date(p.periodStart)).toBe(true);
    });

    test(`GET /dashboard/doctors/{doctorId}/top-diagnoses for ${d.name}`, async ({ dashboard }) => {
      const data = (await dashboard.topDiagnoses(doctorId!, d.value)).expectStatus(200);
      const counts = data.map((x: any) => x.encounterCount);
      expect(counts).toEqual([...counts].sort((a, b) => b - a)); // highest first
    });
  }

  test('encounters with DurationType=0 (not a valid option) returns 400', async ({ dashboard }) => {
    await knownBug('accepts 0 and answers 200 with durationType: 0.');
    (await dashboard.encounters(doctorId!, '0')).expectValidationError('DurationType');
  });
});

test('requests without a token return 401', async ({ anon }) => {
  (await anon(DoctorDashboardApi).prescriptionAnalysis(crypto.randomUUID())).expectUnauthorized();
});

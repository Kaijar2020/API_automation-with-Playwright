import path from 'path';
import { test, TestInfo } from '@playwright/test';
import * as allure from 'allure-js-commons';

// Allure grouping: epic = area, feature = Swagger tag (test folder), story = describe block.
const EPICS: Record<string, string> = {
  Advices: 'Catalogs', ChiefComplaints: 'Catalogs', Diagnosis: 'Catalogs', Referrals: 'Catalogs',
  Examinations: 'Catalogs', Medicines: 'Catalogs', MedicineFormulationConfigs: 'Catalogs',
  KnownCases: 'Catalogs', Investigations: 'Catalogs',
  DoctorAdviceReferences: 'Doctor personalisation', DoctorDiagnosesReferences: 'Doctor personalisation',
  DoctorExaminations: 'Doctor personalisation', DoctorInvestigationReferences: 'Doctor personalisation',
  DoctorMedicineReferences: 'Doctor personalisation', DoctorReferralReferences: 'Doctor personalisation',
  DoctorDictionary: 'Doctor personalisation', DoctorDashboard: 'Doctor personalisation', Templates: 'Doctor personalisation',
  Prescriptions: 'Prescriptions', Patients: 'Prescriptions', PrescriptionSettings: 'Prescriptions',
  setup: 'Authentication',
};

export async function applyAllureLabels(testInfo: TestInfo) {
  const feature = path.basename(path.dirname(testInfo.file));
  const story = testInfo.titlePath.slice(1, -1).join(' › ').replace(/\s*@\w+/g, '');

  // Report tree mirrors the code base: module folder › describe block › test (see allurerc.mjs groupBy).
  await allure.label('module', feature);
  await allure.label('section', story || 'General');

  await allure.epic(EPICS[feature] ?? 'Other');
  await allure.feature(feature);
  if (story) await allure.story(story);

  const tags = testInfo.tags.map(t => t.replace('@', ''));
  const severity = tags.includes('smoke') ? allure.Severity.CRITICAL
    : tags.includes('crud') ? allure.Severity.NORMAL : allure.Severity.MINOR;
  await allure.severity(severity);
}

/** Mark a test as covering a known API bug: tagged "known-bug" in Allure and annotated in the HTML report. */
export async function knownBug(description: string) {
  test.info().annotations.push({ type: 'known-bug', description });
  await allure.tag('known-bug');
  await allure.description(`**Known API bug:** ${description}`);
}

import { test as base, request as pwRequest, APIRequestContext } from '@playwright/test';
import { env } from '@config';
import { getToken } from '@utils/auth';
import * as apis from '@api/index';
import { applyAllureLabels } from '@utils/allure';
import { cleanupAfterTest } from '../cleanup/registry';

type ApiClass<T> = new (ctx: APIRequestContext) => T;

type Fixtures = {
  advices: apis.AdvicesApi;
  chiefComplaints: apis.ChiefComplaintsApi;
  diagnosis: apis.DiagnosisApi;
  referrals: apis.ReferralsApi;
  examinations: apis.ExaminationsApi;
  medicines: apis.MedicinesApi;
  formulationConfigs: apis.MedicineFormulationConfigsApi;
  knownCases: apis.KnownCasesApi;
  investigations: apis.InvestigationsApi;
  doctorAdviceRefs: apis.DoctorAdviceReferencesApi;
  doctorDiagnosesRefs: apis.DoctorDiagnosesReferencesApi;
  doctorExaminations: apis.DoctorExaminationsApi;
  doctorInvestigationRefs: apis.DoctorInvestigationReferencesApi;
  doctorMedicineRefs: apis.DoctorMedicineReferencesApi;
  doctorReferralRefs: apis.DoctorReferralReferencesApi;
  doctorDictionary: apis.DoctorDictionaryApi;
  dashboard: apis.DoctorDashboardApi;
  templates: apis.TemplatesApi;
  prescriptions: apis.PrescriptionsApi;
  patients: apis.PatientsApi;
  prescriptionSettings: apis.PrescriptionSettingsApi;
  /** Same API class without a token, for 401 checks: anon(AdvicesApi).getAll() */
  anon: <T>(cls: ApiClass<T>) => T;
};

const newContext = (headers: Record<string, string> = {}) =>
  pwRequest.newContext({
    baseURL: env.baseURL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Accept: 'application/json', ...headers },
  });

type Internal = { authedCtx: APIRequestContext; anonCtx: APIRequestContext; allureLabels: void; cleanup: void };

const client = <T>(cls: ApiClass<T>) =>
  async ({ authedCtx }: { authedCtx: APIRequestContext }, use: (t: T) => Promise<void>) => use(new cls(authedCtx));

export const test = base.extend<Fixtures & Internal>({
  allureLabels: [async ({}, use, testInfo) => {
    await applyAllureLabels(testInfo);
    await use();
  }, { auto: true }],
  // Deletes every record the test created (newest first), whether the test passed, failed or timed out.
  // Own timeout so a slow server cannot skip it; own request context because authedCtx is disposed by then.
  cleanup: [async ({}, use, testInfo) => {
    await use();
    await cleanupAfterTest(testInfo);
  }, { auto: true, timeout: 120_000 }],
  authedCtx: async ({}, use) => {
    const ctx = await newContext({ Authorization: `Bearer ${await getToken()}` });
    await use(ctx);
    await ctx.dispose();
  },
  anonCtx: async ({}, use) => {
    const ctx = await newContext();
    await use(ctx);
    await ctx.dispose();
  },
  anon: async ({ anonCtx }, use) => use(cls => new cls(anonCtx)),

  advices: client(apis.AdvicesApi),
  chiefComplaints: client(apis.ChiefComplaintsApi),
  diagnosis: client(apis.DiagnosisApi),
  referrals: client(apis.ReferralsApi),
  examinations: client(apis.ExaminationsApi),
  medicines: client(apis.MedicinesApi),
  formulationConfigs: client(apis.MedicineFormulationConfigsApi),
  knownCases: client(apis.KnownCasesApi),
  investigations: client(apis.InvestigationsApi),
  doctorAdviceRefs: client(apis.DoctorAdviceReferencesApi),
  doctorDiagnosesRefs: client(apis.DoctorDiagnosesReferencesApi),
  doctorExaminations: client(apis.DoctorExaminationsApi),
  doctorInvestigationRefs: client(apis.DoctorInvestigationReferencesApi),
  doctorMedicineRefs: client(apis.DoctorMedicineReferencesApi),
  doctorReferralRefs: client(apis.DoctorReferralReferencesApi),
  doctorDictionary: client(apis.DoctorDictionaryApi),
  dashboard: client(apis.DoctorDashboardApi),
  templates: client(apis.TemplatesApi),
  prescriptions: client(apis.PrescriptionsApi),
  patients: client(apis.PatientsApi),
  prescriptionSettings: client(apis.PrescriptionSettingsApi),
});

export { expect } from '@playwright/test';

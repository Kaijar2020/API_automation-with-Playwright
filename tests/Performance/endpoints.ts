import { APIRequestContext } from '@playwright/test';
import * as apis from '@api/index';
import { ApiResult } from '@api/index';
import { doctorId, patientId } from '@utils/ids';

/** Read endpoints measured by the performance suite. `needs` skips an entry until the id is configured. */
export interface PerfEndpoint {
  name: string;
  needs?: 'doctor' | 'patient';
  call: (ctx: APIRequestContext) => Promise<ApiResult>;
}

export const READ_ENDPOINTS: PerfEndpoint[] = [
  { name: 'GET /Advices', call: c => new apis.AdvicesApi(c).getAll({ pageSize: 20 }) },
  { name: 'GET /Advices/search', call: c => new apis.AdvicesApi(c).search('avoid') },
  { name: 'GET /ChiefComplaints/search', call: c => new apis.ChiefComplaintsApi(c).search('head') },
  { name: 'GET /ChiefComplaints/fuzzy-search', call: c => new apis.ChiefComplaintsApi(c).fuzzySearch('headche') },
  { name: 'GET /ChiefComplaints/semantic-search', call: c => new apis.ChiefComplaintsApi(c).semanticSearch('head pain') },
  { name: 'GET /Diagnosis/search', call: c => new apis.DiagnosisApi(c).search('diabetes') },
  { name: 'GET /Examinations/search', call: c => new apis.ExaminationsApi(c).search('tender') },
  { name: 'GET /Medicines', call: c => new apis.MedicinesApi(c).getAll({ pageSize: 20 }) },
  { name: 'GET /Medicines/search', call: c => new apis.MedicinesApi(c).search('napa') },
  { name: 'GET /investigations/search', call: c => new apis.InvestigationsApi(c).search('cbc', 'male', 30) },
  { name: 'GET /Referrals/search', call: c => new apis.ReferralsApi(c).search('a') },
  { name: 'GET /KnownCases', call: c => new apis.KnownCasesApi(c).getAll() },
  { name: 'GET /medicine-formulation-configs', call: c => new apis.MedicineFormulationConfigsApi(c).getAll() },
  { name: 'GET /Medicines/combined/search', needs: 'doctor', call: c => new apis.MedicinesApi(c).combinedSearch(doctorId!, 'napa') },
  { name: 'GET /Templates', needs: 'doctor', call: c => new apis.TemplatesApi(c).getAll({ doctorId }) },
  { name: 'GET /Prescriptions/doctor/{doctorId}', needs: 'doctor', call: c => new apis.PrescriptionsApi(c).getByDoctor(doctorId!) },
  { name: 'GET /dashboard/doctors/{doctorId}/prescription-analysis', needs: 'doctor', call: c => new apis.DoctorDashboardApi(c).prescriptionAnalysis(doctorId!) },
  { name: 'GET /Patients/GetPatientHistory/{patientId}', needs: 'patient', call: c => new apis.PatientsApi(c).getPatientHistory(patientId!, doctorId) },
];

/** Most used lookups while a doctor writes a prescription: the load test hits these concurrently. */
export const LOAD_ENDPOINTS = READ_ENDPOINTS.filter(e =>
  ['GET /Medicines/search', 'GET /Diagnosis/search', 'GET /ChiefComplaints/search', 'GET /Advices/search', 'GET /investigations/search'].includes(e.name));

export const missingId = (e: PerfEndpoint) =>
  (e.needs === 'doctor' && !doctorId) || (e.needs === 'patient' && (!patientId || !doctorId));

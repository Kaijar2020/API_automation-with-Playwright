import { env } from '@config';
import { ApiClient } from './ApiClient';
import { recordUndeletable } from '../cleanup/undeletable';

export type PrescriptionStatus = 'draft' | 'active' | 'completed' | 'cancelled' | 'expired';

export class PrescriptionsApi extends ApiClient {
  /**
   * The API has no single-prescription delete, so every created prescription stays in the database.
   * (DELETE /Prescriptions/doctor/{doctorId}/hard-delete wipes ALL of a doctor's prescriptions: blocked in ApiClient, never used.)
   * Real prescriptions are only sent when PRESCRIPTION_WRITES=true; each created id is reported (reports/cleanup.md)
   * so the backend team can remove it. When DELETE /Prescriptions/{id} exists, add it here as
   * `cleanup: this.deleteById('/Prescriptions/{id}')` and drop the recording.
   */
  async create(data: any) {
    if ((data?.patientId || data?.doctorId) && !env.prescriptionWrites) {
      throw new Error('Refusing to create a prescription: it cannot be deleted. Set PRESCRIPTION_WRITES=true to allow it.');
    }
    const res = await this.post('/Prescriptions', { data });
    if (res.status >= 200 && res.status < 300) {
      const created: any = res.data;
      const id = typeof created === 'string' ? created : created?.id ?? '(id not in response)';
      await recordUndeletable('Prescription', String(id), String(data?.notes ?? ''));
    }
    return res;
  }
  getById(id: string, gender?: string, age?: number) {
    return this.get('/Prescriptions/{id}', { path: { id }, query: { gender, age } });
  }
  getFormatted(id: string) { return this.get('/Prescriptions/{id}/formatted', { path: { id } }); }
  downloadPdf(id: string) { return this.get('/Prescriptions/{id}/pdf', { path: { id } }); }
  getByPatient(patientId: string) { return this.get('/Prescriptions/patient/{patientId}', { path: { patientId } }); }
  getByDoctor(doctorId: string, page = 1, pageSize = 10) {
    return this.get('/Prescriptions/doctor/{doctorId}', { path: { doctorId }, query: { page, pageSize } });
  }
  getPrescriptionList(doctorId?: string, page = 1, pageSize = 10) {
    return this.get('/Prescriptions/doctor/get-prescription-list', { query: { doctorId, page, pageSize } });
  }
  getByPatientAndDoctor(patientId: string, doctorId: string) {
    return this.get('/Prescriptions/patient/{patientId}/doctor/{doctorId}', { path: { patientId, doctorId } });
  }
  update(id: string, doctorId: string, data: unknown) {
    return this.put('/Prescriptions/prescriptionId/{id}/doctor/{doctorId}', { path: { id, doctorId }, data });
  }
  syncInvestigations(id: string, data: unknown) { return this.put('/Prescriptions/{id}/investigations', { path: { id }, data }); }
  updateStatus(id: string, status: PrescriptionStatus | string) {
    return this.patch('/Prescriptions/{id}/status', { path: { id }, data: { status } });
  }
  // DELETE /Prescriptions/doctor/{doctorId}/hard-delete is never called: it wipes every prescription of a doctor (blocked in ApiClient).
}

export class PatientsApi extends ApiClient {
  getPrescriptionDetail(q: { id: string; doctorId: string; visitNumber?: number; gender?: string; age?: number }) {
    return this.get('/Patients/get-prescription-detail', { query: q });
  }
  getPatientHistory(patientId: string, doctorId?: string, pageNumber = 1, pageSize = 10) {
    return this.get('/Patients/GetPatientHistory/{patientId}', { path: { patientId }, query: { doctorId, pageNumber, pageSize } });
  }
}

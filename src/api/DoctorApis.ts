import { ApiClient } from './ApiClient';

// Doctor-personalised lists. They share the same endpoint shape, so each class only names its resource.

type ListQuery = { doctorId?: string; searchTerm?: string; isPersonalized?: boolean; page?: number; pageSize?: number };

abstract class DoctorReferenceApi extends ApiClient {
  protected abstract resource: string;
  /** Field holding the record key in responses */
  protected idKey = 'id';

  private rawId = (x: any) => (x && typeof x === 'object' ? x[this.idKey] ?? x.id : x);

  list(doctorId?: string, searchTerm?: string) { return this.get(`/${this.resource}`, { query: { doctorId, searchTerm } }); }
  getAllByDoctorId(q: ListQuery) {
    return this.get(`/${this.resource}/get-all-by-doctorId`, { query: { page: 1, pageSize: 10, ...q } });
  }
  getById(id: string | number) { return this.get(`/${this.resource}/{id}`, { path: { id } }); }
  create(data: unknown) {
    return this.post(`/${this.resource}`, { data, cleanup: this.deleteById(`/${this.resource}/{id}`, this.idKey) });
  }
  update(id: string | number, data: unknown) { return this.put(`/${this.resource}/{id}`, { path: { id }, data }); }
  remove(id: string | number) { return this.delete(`/${this.resource}/{id}`, { path: { id } }); }
  bulkCreate(doctorId: string, items: unknown[]) {
    return this.post(`/${this.resource}/bulk`, {
      data: { doctorId, items },
      cleanup: created => {
        const list: any[] = Array.isArray(created) ? created : created?.items;
        if (!Array.isArray(list)) throw new Error(`No created items in response: ${JSON.stringify(created)?.slice(0, 500)}`);
        return { template: `/${this.resource}/bulk`, data: { ids: list.map(this.rawId) } };
      },
    });
  }
  bulkDelete(ids: (string | number)[]) { return this.delete(`/${this.resource}/bulk`, { data: { ids } }); }
}

export class DoctorAdviceReferencesApi extends DoctorReferenceApi { protected resource = 'DoctorAdviceReferences'; }
export class DoctorDiagnosesReferencesApi extends DoctorReferenceApi { protected resource = 'DoctorDiagnosesReferences'; }
export class DoctorExaminationsApi extends DoctorReferenceApi { protected resource = 'DoctorExaminations'; }

export class DoctorInvestigationReferencesApi extends DoctorReferenceApi {
  protected resource = 'DoctorInvestigationReferences';
  getAllTestsByPanelId(panelId: number, doctorId?: string) {
    return this.get('/DoctorInvestigationReferences/get-all-test-by-panelId', { query: { panelId, doctorId } });
  }
}

export class DoctorMedicineReferencesApi extends DoctorReferenceApi {
  protected resource = 'DoctorMedicineReferences';
  protected idKey = 'medicineId';
  getMedicine(id: string, doctorId?: string, isPersonalized?: boolean) {
    return this.get('/DoctorMedicineReferences/medicine/{id}', { path: { id }, query: { doctorId, isPersonalized } });
  }
}

export class DoctorReferralReferencesApi extends DoctorReferenceApi {
  protected resource = 'DoctorReferralReferences';
  categoryCounts(doctorId: string, searchTerm?: string) {
    return this.get('/DoctorReferralReferences/category-counts', { query: { doctorId, searchTerm } });
  }
}

export class DoctorDictionaryApi extends ApiClient {
  list(doctorId: string) { return this.get('/DoctorDictionary', { query: { doctorId } }); }
  getById(id: string) { return this.get('/DoctorDictionary/{id}', { path: { id } }); }
  create(data: unknown) { return this.post('/DoctorDictionary', { data, cleanup: this.deleteById('/DoctorDictionary/{id}') }); }
  update(id: string, data: unknown) { return this.put('/DoctorDictionary/{id}', { path: { id }, data }); }
  remove(id: string) { return this.delete('/DoctorDictionary/{id}', { path: { id } }); }
}

export type DurationType = string;

export class DoctorDashboardApi extends ApiClient {
  prescriptionAnalysis(doctorId: string) {
    return this.get('/dashboard/doctors/{doctorId}/prescription-analysis', { path: { doctorId } });
  }
  encounters(doctorId: string, DurationType?: DurationType) {
    return this.get('/dashboard/doctors/{doctorId}/encounters', { path: { doctorId }, query: { DurationType } });
  }
  topDiagnoses(doctorId: string, DurationType?: DurationType) {
    return this.get('/dashboard/doctors/{doctorId}/top-diagnoses', { path: { doctorId }, query: { DurationType } });
  }
}

export class TemplatesApi extends ApiClient {
  getAll(q: { doctorId?: string; templateType?: string; page?: number; pageSize?: number } = {}) {
    return this.get('/Templates', { query: { page: 1, pageSize: 10, ...q } });
  }
  search(q: { doctorId?: string; templateType?: string; searchTerm?: string; page?: number; pageSize?: number }) {
    return this.get('/Templates/search', { query: { page: 1, pageSize: 10, ...q } });
  }
  getById(id: string) { return this.get('/Templates/{id}', { path: { id } }); }
  create(data: unknown) { return this.post('/Templates', { data, cleanup: this.deleteById('/Templates/{id}') }); }
  update(id: string, data: unknown) { return this.put('/Templates/{id}', { path: { id }, data }); }
  remove(id: string) { return this.delete('/Templates/{id}', { path: { id } }); }
}

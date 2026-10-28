import { ApiClient } from './ApiClient';

// Shared catalogs. One class per Swagger tag, one method per endpoint.
// Every create declares its delete (`cleanup`), so test records never stay in the master catalogs.

type Paging = { page?: number; pageSize?: number };
const paging = (p: Paging = {}) => ({ page: p.page ?? 1, pageSize: p.pageSize ?? 10 });

export class AdvicesApi extends ApiClient {
  getAll(p?: Paging) { return this.get('/Advices', { query: paging(p) }); }
  search(searchTerm: string, p?: Paging) { return this.get('/Advices/search', { query: { searchTerm, ...paging(p) } }); }
  combinedSearch(searchTerm: string, doctorId?: string, p?: Paging) {
    return this.get('/Advices/combined-search', { query: { searchTerm, doctorId, ...paging(p) } });
  }
  getById(id: string) { return this.get('/Advices/{id}', { path: { id } }); }
  create(data: unknown) { return this.post('/Advices', { data, cleanup: this.deleteById('/Advices/{id}') }); }
  update(id: string, data: unknown) { return this.put('/Advices/{id}', { path: { id }, data }); }
  remove(id: string) { return this.delete('/Advices/{id}', { path: { id } }); }
}

export class ChiefComplaintsApi extends ApiClient {
  getAll(p?: Paging) { return this.get('/ChiefComplaints', { query: paging(p) }); }
  search(searchTerm: string, p?: Paging) { return this.get('/ChiefComplaints/search', { query: { searchTerm, ...paging(p) } }); }
  fuzzySearch(searchTerm: string) { return this.get('/ChiefComplaints/fuzzy-search', { query: { searchTerm } }); }
  semanticSearch(searchTerm: string) { return this.get('/ChiefComplaints/semantic-search', { query: { searchTerm } }); }
  searchHistory(doctorId: string, searchTerm?: string, p?: Paging) {
    return this.get('/ChiefComplaints/search-history/{doctorId}', { path: { doctorId }, query: { searchTerm, ...paging(p) } });
  }
  getById(id: string) { return this.get('/ChiefComplaints/{id}', { path: { id } }); }
  create(data: unknown) { return this.post('/ChiefComplaints', { data, cleanup: this.deleteById('/ChiefComplaints/{id}') }); }
  update(id: string, data: unknown) { return this.put('/ChiefComplaints/{id}', { path: { id }, data }); }
  remove(id: string) { return this.delete('/ChiefComplaints/{id}', { path: { id } }); }
}

export class DiagnosisApi extends ApiClient {
  getAll(p?: Paging) { return this.get('/Diagnosis', { query: paging(p) }); }
  search(searchTerm: string, p?: Paging) { return this.get('/Diagnosis/search', { query: { searchTerm, ...paging(p) } }); }
  combinedSearch(searchTerm: string, doctorId?: string, p?: Paging) {
    return this.get('/Diagnosis/combined-search', { query: { searchTerm, doctorId, ...paging(p) } });
  }
  create(data: unknown) { return this.post('/Diagnosis', { data, cleanup: this.deleteById('/Diagnosis/{id}') }); }
  update(id: string, data: unknown) { return this.put('/Diagnosis/{id}', { path: { id }, data }); }
  remove(id: string) { return this.delete('/Diagnosis/{id}', { path: { id } }); }
}

export class ReferralsApi extends ApiClient {
  getAll(p?: Paging) { return this.get('/Referrals', { query: paging(p) }); }
  search(searchTerm: string, category?: string, p?: Paging) {
    return this.get('/Referrals/search', { query: { searchTerm, category, ...paging(p) } });
  }
  combinedSearch(searchTerm: string, doctorId?: string, category?: string, p?: Paging) {
    return this.get('/Referrals/combined-search', { query: { searchTerm, doctorId, category, ...paging(p) } });
  }
  categories() { return this.get('/Referrals/categories'); }
  getById(id: string) { return this.get('/Referrals/{id}', { path: { id } }); }
  create(data: unknown) { return this.post('/Referrals', { data, cleanup: this.deleteById('/Referrals/{id}') }); }
  update(id: string, data: unknown) { return this.put('/Referrals/{id}', { path: { id }, data }); }
  remove(id: string) { return this.delete('/Referrals/{id}', { path: { id } }); }
}

export class ExaminationsApi extends ApiClient {
  getAll(p?: Paging) { return this.get('/Examinations', { query: paging(p) }); }
  search(searchTerm: string, p?: Paging) { return this.get('/Examinations/search', { query: { searchTerm, ...paging(p) } }); }
  combinedSearch(searchTerm: string, doctorId?: string, p?: Paging) {
    return this.get('/Examinations/combined-search', { query: { searchTerm, doctorId, ...paging(p) } });
  }
}

export class MedicinesApi extends ApiClient {
  getAll(p?: Paging) { return this.get('/Medicines', { query: paging(p) }); }
  search(searchTerm: string, p?: Paging) { return this.get('/Medicines/search', { query: { searchTerm, ...paging(p) } }); }
  combined(doctorId: string, p?: Paging) { return this.get('/Medicines/combined', { query: { doctorId, ...paging(p) } }); }
  combinedSearch(doctorId: string, searchTerm: string, p?: Paging) {
    return this.get('/Medicines/combined/search', { query: { doctorId, searchTerm, ...paging(p) } });
  }
  getById(id: string) { return this.get('/Medicines/{id}', { path: { id } }); }
}

export class MedicineFormulationConfigsApi extends ApiClient {
  getAll() { return this.get('/medicine-formulation-configs'); }
  lookup(version?: number) { return this.get('/medicine-formulation-configs/lookup', { query: { version } }); }
  getByCode(formulationCode: string, version?: number) {
    return this.get('/medicine-formulation-configs/by-code/{formulationCode}', { path: { formulationCode }, query: { version } });
  }
}

export class KnownCasesApi extends ApiClient {
  getAll() { return this.get('/KnownCases'); }
}

export class InvestigationsApi extends ApiClient {
  search(searchTerm: string, gender?: string, age?: number) {
    return this.get('/investigations/search', { query: { searchTerm, gender, age } });
  }
  combinedSearch(searchTerm: string, doctorId?: string, p?: Paging) {
    return this.get('/investigations/combined-search', { query: { searchTerm, doctorId, ...paging(p) } });
  }
  getPanels(p?: Paging) { return this.get('/investigations/panels', { query: paging(p) }); }
  getPanel(id: number) { return this.get('/investigations/panels/{id}', { path: { id } }); }
  getPanelTests(id: number, gender?: string, age?: number) {
    return this.get('/investigations/panels/{id}/tests', { path: { id }, query: { gender, age } });
  }
  createPanel(data: unknown) {
    return this.post('/investigations/panels', { data, cleanup: this.deleteById('/investigations/panels/{id}', 'panelId') });
  }
  updatePanel(id: number, data: unknown) { return this.put('/investigations/panels/{id}', { path: { id }, data }); }
  deletePanel(id: number) { return this.delete('/investigations/panels/{id}', { path: { id } }); }
  getTest(id: number) { return this.get('/investigations/tests/{id}', { path: { id } }); }
  createTest(data: unknown) {
    return this.post('/investigations/tests', { data, cleanup: this.deleteById('/investigations/tests/{id}', 'testId') });
  }
  updateTest(id: number, data: unknown) { return this.put('/investigations/tests/{id}', { path: { id }, data }); }
  deleteTest(id: number) { return this.delete('/investigations/tests/{id}', { path: { id } }); }
  checkAbnormality(data: unknown) { return this.post('/investigations/abnormality', { data }); }
}

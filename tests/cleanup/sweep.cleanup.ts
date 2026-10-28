import fs from 'fs';
import { APIRequestContext } from '@playwright/test';
import path from 'path';
import { test, expect } from '@fixtures';
import * as apis from '@api/index';
import { ApiResult } from '@api/index';
import { doctorId, NEED_DOCTOR } from '@utils/ids';

/**
 * Finds "[AUTO] ..." records that earlier runs left in the database and deletes them.
 *   npm run cleanup:sweep          dry run: only lists what would be deleted (reports/cleanup-sweep.md)
 *   npm run cleanup:sweep:apply    deletes them
 *
 * Safety: a record is touched only when its own name/text field starts with "[AUTO] " (the prefix every
 * test payload uses), never because a search matched it. Prescription settings are only removed for a
 * chamber, never at doctor level. Prescriptions cannot be deleted one by one; they are only listed.
 */

const APPLY = process.env.SWEEP_APPLY === 'true';
const REPORT = path.resolve(__dirname, '..', '..', 'reports', 'cleanup-sweep.md');
const MAX_PAGES = 50;
const isAuto = (text: unknown) => typeof text === 'string' && text.startsWith('[AUTO] ');

interface Found { id: string | number; text: string }
interface Target {
  name: string;
  needsDoctor?: boolean;
  /** Fetch one page (1-based) of candidates */
  page: (api: Apis, page: number) => Promise<ApiResult>;
  /** Text that must start with "[AUTO] " */
  text: (item: any) => unknown;
  id: (item: any) => string | number;
  remove?: (api: Apis, item: Found) => Promise<ApiResult>;
}
type Apis = ReturnType<typeof makeApis>;

const makeApis = (ctx: APIRequestContext) => ({
  advices: new apis.AdvicesApi(ctx),
  chiefComplaints: new apis.ChiefComplaintsApi(ctx),
  diagnosis: new apis.DiagnosisApi(ctx),
  referrals: new apis.ReferralsApi(ctx),
  investigations: new apis.InvestigationsApi(ctx),
  doctorAdviceRefs: new apis.DoctorAdviceReferencesApi(ctx),
  doctorDiagnosesRefs: new apis.DoctorDiagnosesReferencesApi(ctx),
  doctorExaminations: new apis.DoctorExaminationsApi(ctx),
  doctorInvestigationRefs: new apis.DoctorInvestigationReferencesApi(ctx),
  doctorMedicineRefs: new apis.DoctorMedicineReferencesApi(ctx),
  doctorReferralRefs: new apis.DoctorReferralReferencesApi(ctx),
  doctorDictionary: new apis.DoctorDictionaryApi(ctx),
  templates: new apis.TemplatesApi(ctx),
  settings: new apis.PrescriptionSettingsApi(ctx),
  prescriptions: new apis.PrescriptionsApi(ctx),
});

const P = 100;
const doctorRefTarget = (name: string, key: keyof Apis, text: (x: any) => unknown, idKey = 'id'): Target => ({
  name,
  needsDoctor: true,
  page: (a, page) => (a[key] as apis.DoctorAdviceReferencesApi).getAllByDoctorId({ doctorId, searchTerm: 'AUTO', page, pageSize: P }),
  // get-all-by-doctorId also returns master-catalog rows (isPersonalized: false); those belong to the catalog targets.
  text: x => (x.isPersonalized === false ? undefined : text(x)),
  id: x => x[idKey] ?? x.id,
  remove: (a, f) => (a[key] as apis.DoctorAdviceReferencesApi).remove(f.id),
});

const TARGETS: Target[] = [
  // Master catalogs
  { name: 'Advices', page: (a, page) => a.advices.search('AUTO', { page, pageSize: P }), text: x => x.descriptionEn, id: x => x.id, remove: (a, f) => a.advices.remove(String(f.id)) },
  { name: 'ChiefComplaints', page: (a, page) => a.chiefComplaints.search('AUTO', { page, pageSize: P }), text: x => x.term, id: x => x.id, remove: (a, f) => a.chiefComplaints.remove(String(f.id)) },
  { name: 'Diagnosis', page: (a, page) => a.diagnosis.search('AUTO', { page, pageSize: P }), text: x => x.name, id: x => x.id, remove: (a, f) => a.diagnosis.remove(String(f.id)) },
  { name: 'Referrals', page: (a, page) => a.referrals.search('AUTO', undefined, { page, pageSize: P }), text: x => x.name, id: x => x.id, remove: (a, f) => a.referrals.remove(String(f.id)) },
  { name: 'Investigation panels', page: (a, page) => a.investigations.getPanels({ page, pageSize: P }), text: x => x.panelName ?? x.name, id: x => x.panelId ?? x.id, remove: (a, f) => a.investigations.deletePanel(Number(f.id)) },
  // Doctor personalisation (DOCTOR_ID)
  doctorRefTarget('DoctorAdviceReferences', 'doctorAdviceRefs', x => x.descriptionEn),
  doctorRefTarget('DoctorDiagnosesReferences', 'doctorDiagnosesRefs', x => x.name),
  doctorRefTarget('DoctorExaminations', 'doctorExaminations', x => x.clinicalNoteEn),
  doctorRefTarget('DoctorInvestigationReferences', 'doctorInvestigationRefs', x => x.name),
  doctorRefTarget('DoctorMedicineReferences', 'doctorMedicineRefs', x => x.brandName, 'medicineId'),
  doctorRefTarget('DoctorReferralReferences', 'doctorReferralRefs', x => x.name),
  { name: 'DoctorDictionary', needsDoctor: true, page: (a, page) => a.doctorDictionary.list(doctorId!).then(r => (page === 1 ? r : emptyPage(r))), text: x => x.text, id: x => x.id, remove: (a, f) => a.doctorDictionary.remove(String(f.id)) },
  { name: 'Templates', needsDoctor: true, page: (a, page) => a.templates.getAll({ doctorId, page, pageSize: P }), text: x => x.name, id: x => x.id, remove: (a, f) => a.templates.remove(String(f.id)) },
  {
    name: 'Prescription settings (test chambers)',
    needsDoctor: true,
    page: (a, page) => a.settings.getAllByDoctorId(doctorId).then(r => (page === 1 ? r : emptyPage(r))),
    // Only chamber-level records; doctor-level settings are never touched.
    text: x => (x.chamberId ? x.header?.doctorName?.en : undefined),
    id: x => x.chamberId,
    remove: (a, f) => a.settings.remove(doctorId, String(f.id)),
  },
  // No single delete: listed so the backend team can remove them.
  { name: 'Prescriptions (list only, no delete endpoint)', needsDoctor: true, page: (a, page) => a.prescriptions.getByDoctor(doctorId!, page, P), text: x => x.notes, id: x => x.id },
];

/** Fake "no more items" result for endpoints without paging. */
function emptyPage(r: ApiResult): ApiResult {
  return Object.create(r, { data: { get: () => [] }, pagination: { get: () => undefined } });
}

async function collect(api: Apis, t: Target): Promise<Found[]> {
  const found: Found[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await t.page(api, page);
    const data = res.expectStatus(200);
    const items: any[] = Array.isArray(data) ? data : data?.items ?? [];
    for (const item of items) {
      const text = t.text(item);
      if (isAuto(text)) found.push({ id: t.id(item), text: String(text) });
    }
    const totalPages = res.pagination?.totalPages;
    if (!items.length || (totalPages !== undefined ? page >= totalPages : items.length < P)) break;
  }
  // Collected first, deleted afterwards, so deleting never shifts the pages being read.
  return found;
}

const summary: string[] = [];

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, [
    `# [AUTO] test-data sweep - ${new Date().toISOString()} (${APPLY ? 'APPLY: records deleted' : 'DRY RUN: nothing deleted'})`,
    '',
    ...summary,
    '',
    APPLY ? '' : 'Run `npm run cleanup:sweep:apply` to delete the records listed above.',
  ].join('\n'));
});

for (const t of TARGETS) {
  test(`sweep ${t.name}`, async ({ authedCtx }) => {
    test.skip(!!t.needsDoctor && !doctorId, NEED_DOCTOR);
    const api = makeApis(authedCtx);
    const found = await collect(api, t);
    await test.info().attach(`${t.name}: ${found.length} [AUTO] record(s)`, { body: JSON.stringify(found, null, 2), contentType: 'application/json' });

    const failed: string[] = [];
    if (APPLY && t.remove) {
      for (const f of found) {
        const res = await t.remove(api, f);
        if (![200, 204, 404].includes(res.status)) failed.push(`${f.id} -> ${res.status}`);
      }
    }

    const action = !found.length ? 'none found' : !t.remove ? 'cannot be deleted by the API' : APPLY ? `deleted ${found.length - failed.length}` : 'would delete';
    summary.push(`## ${t.name}: ${found.length} (${action})`, ...found.slice(0, 200).map(f => `- \`${f.id}\` ${f.text}`), ...failed.map(f => `- FAILED ${f}`), '');
    console.log(`${t.name.padEnd(48)} ${String(found.length).padStart(5)} [AUTO] record(s) - ${action}`);
    expect(failed, 'records that could not be deleted').toEqual([]);
  });
}

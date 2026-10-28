import { expect } from '@playwright/test';
import type {
  AdvicesApi, ChiefComplaintsApi, DiagnosisApi, InvestigationsApi, MedicineFormulationConfigsApi, MedicinesApi,
} from '@api/index';
import type { PrescriptionCatalogRefs } from './payloads';

/** Never link a prescription to a record another test run left behind. */
const real = (items: any[], text: (x: any) => unknown) => items.filter(x => !String(text(x) ?? '').startsWith('[AUTO]'));
const two = <T>(items: T[], what: string): [T, T] => {
  expect(items.length, `two ${what} found in the catalog`).toBeGreaterThanOrEqual(2);
  return [items[0], items[1]];
};

/**
 * Real catalog records and dosage dropdowns for a prescription (read-only lookups).
 * Medicines: four different solid (FC-01) medicines: default dosage, dropdown dosage, two drug histories.
 */
export async function lookupPrescriptionRefs(api: {
  diagnosis: DiagnosisApi; chiefComplaints: ChiefComplaintsApi; advices: AdvicesApi;
  investigations: InvestigationsApi; medicines: MedicinesApi; formulationConfigs: MedicineFormulationConfigsApi;
}): Promise<PrescriptionCatalogRefs> {
  const diagnoses = real((await api.diagnosis.search('diabetes')).expectStatus(200), d => d.name);
  const complaints = real((await api.chiefComplaints.search('head')).expectStatus(200), c => c.term);
  const advices = real((await api.advices.search('avoid')).expectStatus(200), a => a.descriptionEn);

  const panel = (await api.investigations.getPanels({ pageSize: 1 })).expectStatus(200)[0];
  const panelTests = (await api.investigations.getPanelTests(panel.panelId ?? panel.id)).expectStatus(200);
  const tests = (Array.isArray(panelTests) ? panelTests : panelTests.tests ?? [])
    .map((t: any) => ({ testId: t.testId, panelId: panel.panelId ?? panel.id, name: t.name, abbreviation: t.abbreviation }));

  const found = (await api.medicines.search('napa', { pageSize: 20 })).expectStatus(200).filter((m: any) => m.formulationCode === 'FC-01');
  const solid = real([...new Map(found.map((m: any) => [m.medicineId, m])).values()] as any[], m => m.brandName);
  expect(solid.length, 'four different FC-01 medicines found').toBeGreaterThanOrEqual(4);

  const dropdowns = (await api.formulationConfigs.lookup()).expectStatus(200).find((c: any) => c.id === 'FC-01');
  const current = (await api.formulationConfigs.getAll()).expectStatus(200).find((c: any) => c.formulationCode === 'FC-01' && c.isCurrent);
  expect(dropdowns?.fields?.some((f: any) => f.options.length), 'FC-01 has dosage dropdown options').toBe(true);
  expect(current, 'current FC-01 config version').toBeTruthy();

  return {
    diagnoses: two(diagnoses, 'diagnoses'),
    complaints: two(complaints, 'chief complaints'),
    advices: two(advices, 'advices'),
    tests: two(tests, 'investigation tests'),
    defaultDosageMedicine: solid[0],
    dropdownDosageMedicine: solid[1],
    drugs: [solid[2], solid[3]],
    formulation: { code: 'FC-01', version: current.configVersion, fields: dropdowns.fields },
  };
}

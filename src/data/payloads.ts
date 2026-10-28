import { tagged, isoDateFromNow, uid } from '@utils/data';

// Request bodies built from the Swagger request schemas. "[AUTO]" + unique suffix marks test data.

export const catalog = {
  advice: () => ({ descriptionEn: tagged('Drink at least 8 glasses of water daily'), descriptionBn: 'প্রতিদিন অন্তত ৮ গ্লাস পানি পান করুন' }),
  chiefComplaint: () => ({ term: tagged('Headache') }),
  diagnosis: () => ({ name: tagged('Type 2 Diabetes Mellitus'), description: 'Automated test entry', codeType: 'ICD-10', code: 'E11' }),
  referral: () => ({ name: tagged('Cardiology'), category: 'specialty', note: 'Automated test entry' }),
};

export const doctorRef = {
  advice: (doctorId: string) => ({ doctorId, descriptionEn: tagged('Avoid oily food'), descriptionBn: 'তৈলাক্ত খাবার খাবেন না' }),
  diagnosis: (doctorId: string) => ({ doctorId, name: tagged('Hypertension'), description: 'Automated test entry', codeType: 'ICD-10', code: 'I10' }),
  examination: (doctorId: string) => ({ doctorId, clinicalNoteEn: tagged('Mild tenderness in epigastrium'), clinicalNoteBn: 'এপিগ্যাস্ট্রিয়ামে হালকা ব্যথা' }),
  referral: (doctorId: string) => ({ doctorId, name: tagged('Dr. Rahman'), category: 'consultant', note: 'Automated test entry' }),
  dictionary: (doctorId: string) => ({ doctorId, text: tagged('Take after meal'), shortcut: `am${uid()}` }),
  medicine: (doctorId: string) => ({
    doctorId, brandName: tagged('Napa'), strength: '500 mg', genericName: 'Paracetamol', type: 'allopathic',
    dosageForm: 'Tablet', dosageSchedule: '1+0+1', dosageInstruction: 'খাবারের পরে', dosageInstructionEn: 'After meal', manufacturer: 'Beximco',
  }),
  investigation: (doctorId: string) => ({
    doctorId, name: tagged('Fasting Blood Sugar'), isPanel: false, abbreviation: 'FBS', specimen: 'Blood', method: 'Enzymatic', unit: 'mmol/L',
    referenceRanges: [{ gender: 'male', ageGroup: 'adult', min: '3.9', max: '5.6' }],
  }),
};

export const investigation = {
  panel: () => ({ panelName: tagged('Diabetes Panel') }),
  test: (panelId: number) => ({ panelId, testName: tagged('HbA1c'), abbreviation: 'HbA1c', specimen: 'Blood', method: 'HPLC', clinicalNotes: 'Automated test entry' }),
};

export const templatePayload = (doctorId: string) => ({
  doctorId,
  shortcut: `dm${uid()}`,
  name: tagged('Type 2 Diabetes Standard Treatment'),
  templateType: 'treatment',
  clinicalFindings: 'BP 130/80 mmHg',
  notes: 'Automated test template',
  followUpMode: 'after', followUpValue: 4, followUpType: 'weeks',
  diagnoses: [{ diagnosisName: 'Type 2 Diabetes Mellitus', diagnosisCode: 'E11', diagnosisCodeType: 'ICD-10', isPersonalized: false }],
  chiefComplaints: [{ term: 'Increased thirst', duration: '2 months', isCurrent: true, isPersonalized: false, sortOrder: 1 }],
  advices: [{ descriptionEn: 'Low carbohydrate diet, daily 30-min walk', isPersonalized: false, sortOrder: 1 }],
  medicines: [{ brandName: 'Metformin', genericName: 'Metformin HCl', dosageForm: 'Tablet', strength: '500 mg', dosageInstructionEn: '1+0+1 after meal', isPersonalized: false, sortOrder: 1 }],
  tests: [{ name: 'HbA1c', abbreviation: 'HbA1c', isPanel: false, isPersonalized: false }],
  physicalFindings: [{ description: 'No peripheral neuropathy', isPersonalized: false, sortOrder: 1 }],
});

/**
 * Visit type dropdown. The app defines it (there is no API endpoint for it); these are the values
 * prescriptions on staging use.
 */
export const VISIT_TYPES = ['NEW', 'FOLLOW_UP', 'REPORT'] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

/** A medicine from GET /Medicines/search: its dosage fields are the defaults the app pre-fills. */
export interface CatalogMedicine {
  medicineId: string; brandName: string; genericName: string; dosageForm: string; strength: string; formulationCode: string;
  dosageSchedule?: string; dosageInstruction?: string; dosageInstructionEn?: string; childDosages?: unknown[];
}

/** Dosage dropdowns of one formulation (GET /medicine-formulation-configs/lookup) and its current version. */
export interface FormulationDropdowns { code: string; version: number; fields: { key: string; options: string[] }[] }

const pick = (options: string[], choice: number) => options[choice % options.length];

/**
 * One value per dosage dropdown, choosing option number `choice` (wraps around).
 * Duration's dropdown holds units (দিন, সপ্তাহ, মাস, ...); the app saves a count with it, e.g. "৭ দিন".
 */
export const dosageFromDropdowns = (f: FormulationDropdowns, choice: number) =>
  f.fields.filter(x => x.options.length).map(x => ({
    key: x.key,
    value: x.key === 'duration' ? `৭ ${pick(x.options.slice(0, 3), choice)}` : pick(x.options, choice),
  }));

const medicineBase = (m: CatalogMedicine, sortOrder: number, id?: string) => ({
  ...(id ? { id } : {}),
  medicineId: m.medicineId, brandName: m.brandName, genericName: m.genericName, dosageForm: m.dosageForm, strength: m.strength,
  isPersonalized: false, sortOrder,
});

/** Medicine added as the app pre-fills it: the catalog's default dosage, nothing chosen from the dropdowns. */
export const medicineWithDefaultDosage = (m: CatalogMedicine, f: FormulationDropdowns, sortOrder: number, id?: string) => ({
  ...medicineBase(m, sortOrder, id),
  dosageSchedule: m.dosageSchedule, dosageInstruction: m.dosageInstruction, dosageInstructionEn: m.dosageInstructionEn,
  formulationCode: m.formulationCode, formulationConfigVersion: f.version,
  childDosages: m.childDosages ?? [],
});

/** Medicine whose dosage is chosen from the formulation dropdowns, with a follow-on (child) dosage. */
export const medicineWithDropdownDosage = (m: CatalogMedicine, f: FormulationDropdowns, choice: number, sortOrder: number, id?: string) => {
  const values = dosageFromDropdowns(f, choice);
  const value = (key: string) => values.find(v => v.key === key)?.value ?? '';
  return {
    ...medicineBase(m, sortOrder, id),
    // Text the app builds from the chosen dropdown values.
    dosageSchedule: value('frequency'),
    dosageInstruction: [value('frequency'), value('meal_timing'), value('duration')].filter(Boolean).join(' - '),
    dosageInstructionEn: `As chosen: ${value('frequency')}, ${value('duration')}`,
    duration: value('duration'),
    formulationCode: f.code, formulationConfigVersion: f.version,
    values,
    childDosages: [{ values: dosageFromDropdowns(f, choice + 1) }],
  };
};

/** Dropdown choices the create and the update make (different, so the update visibly changes them). */
export const CREATE_CHOICE = { visitType: 'NEW' as VisitType, dosage: 3 };
export const UPDATE_CHOICE = { visitType: 'FOLLOW_UP' as VisitType, dosage: 7 };

interface CatalogDiagnosis { id: string; name: string; code?: string; codeType?: string }
interface CatalogComplaint { id: string; term: string }
interface CatalogAdvice { id: string; descriptionEn: string }
interface CatalogTest { testId: number; panelId: number; name: string; abbreviation?: string }

/**
 * Real master-catalog records the prescription links to (looked up read-only, "[AUTO]" test records excluded).
 * Lists hold two records: [0] is used by the create, [1] is added by the update.
 */
export interface PrescriptionCatalogRefs {
  diagnoses: [CatalogDiagnosis, CatalogDiagnosis];
  complaints: [CatalogComplaint, CatalogComplaint];
  advices: [CatalogAdvice, CatalogAdvice];
  tests: [CatalogTest, CatalogTest];
  /** Prescribed with its catalog default dosage */
  defaultDosageMedicine: CatalogMedicine;
  /** Prescribed with the dosage chosen from the dropdowns */
  dropdownDosageMedicine: CatalogMedicine;
  /** Drug history entries */
  drugs: [CatalogMedicine, CatalogMedicine];
  /** Dosage dropdowns of the medicines' formulation */
  formulation: FormulationDropdowns;
}

const diagnosisItem = (d: CatalogDiagnosis, sortOrder: number, id?: string) => ({
  ...(id ? { id } : {}), diagnosisId: d.id, diagnosisName: d.name, diagnosisCode: d.code ?? 'E11', diagnosisCodeType: d.codeType ?? 'ICD-10', isPersonalized: false, sortOrder,
});
const adviceItem = (a: CatalogAdvice, sortOrder: number, id?: string) => ({
  ...(id ? { id } : {}), adviceId: a.id, description: a.descriptionEn, isPersonalized: false, sortOrder,
});
const drugItem = (m: CatalogMedicine, id?: string) => ({ ...(id ? { id } : {}), drugId: m.medicineId, drugName: m.brandName });

/**
 * Create body with every field of CreatePrescriptionRequest. Every list links to a real catalog record;
 * two medicines: one keeps its catalog default dosage, the other has the dosage chosen from the dropdowns.
 * (Negative tests drop only the field they test.)
 */
export const prescriptionPayload = (patientId: string, doctorId: string, refs: PrescriptionCatalogRefs, chamberId: string) => ({
  patientId,
  doctorId,
  // Not returned by GET /Prescriptions/{id}, so it is sent but cannot be checked.
  patientNumber: `AUTO-${uid()}`,
  chamberId,
  isDraft: false,
  includeSummaryInPdf: false,
  visitType: CREATE_CHOICE.visitType,
  prescriptionDate: isoDateFromNow(0),
  patientAge: 45,
  clinicalFindings: 'BP 130/80 mmHg, FBS 12.5 mmol/L',
  notes: tagged('Monitor blood sugar daily'),
  summary: 'Automated test prescription',
  height: '170', heightUnit: 'cm', weight: '75', weightUnit: 'kg',
  bpSystolic: '130', bpDiastolic: '80', pulseRate: '78', temperature: '98.6', oxygenSaturation: '98', respiratoryRate: '16',
  followUpDate: isoDateFromNow(30), followUpMode: 'after', followUpValue: 1, followUpType: 'months',
  followUpInstructions: 'Repeat FBS after 1 month',
  referredBy: 'Dr. Rahman',
  diagnoses: [diagnosisItem(refs.diagnoses[0], 0)],
  chiefComplaints: [{
    complaintId: refs.complaints[0].id, term: refs.complaints[0].term, onset: 'Gradual', progression: 'Progressive', duration: '2 months',
    aiSuggestedTerm: 'Polydipsia', isVerified: true, isCurrent: true, isPersonalized: false, remarks: 'Since last visit', sortOrder: 0,
  }],
  medicines: [
    medicineWithDefaultDosage(refs.defaultDosageMedicine, refs.formulation, 0),
    medicineWithDropdownDosage(refs.dropdownDosageMedicine, refs.formulation, CREATE_CHOICE.dosage, 1),
  ],
  advices: [adviceItem(refs.advices[0], 0)],
  investigations: [{
    testId: refs.tests[0].testId, panelId: refs.tests[0].panelId, name: refs.tests[0].name, abbreviation: refs.tests[0].abbreviation ?? '',
    instructions: 'Fasting', isUrgent: false, sortOrder: 0, testResult: '8.1', abnormalFlag: 'High', resultNote: 'Above target',
    testDate: isoDateFromNow(-2), isPersonalized: false,
  }],
  drugHistories: [drugItem(refs.drugs[0])],
});

/**
 * Every field of UpdatePrescriptionRequest. Each list keeps the item the create made (sent with its `id`, so it is
 * updated in place, still linked to its catalog record) and adds the second catalog record.
 * sortOrder is the 0-based list position: the API stores the position for medicines, advices and investigations.
 * The existing chief complaint is sent with isCurrent: false, so the API moves it to previousHistories.
 * Medicines: the default-dosage one keeps its default; the other gets a different dosage from the dropdowns.
 * `existing` is the prescription as returned by GET /Prescriptions/{id} after the create.
 */
export const prescriptionFullUpdatePayload = (existing: any, refs: PrescriptionCatalogRefs, chamberId: string) => {
  const [dx] = existing.diagnoses;
  const [cc] = existing.chiefComplaints;
  const [adv] = existing.advices;
  const [inv] = existing.investigations;
  const [drug] = existing.drugHistories;
  const medId = (m: CatalogMedicine) => {
    const saved = existing.medicines.find((x: any) => x.medicineId === m.medicineId);
    return saved?.prescriptionMedicineId ?? saved?.id;
  };

  return {
    visitType: UPDATE_CHOICE.visitType,
    prescriptionDate: isoDateFromNow(0),
    chamberId,
    patientAge: 46,
    includeSummaryInPdf: true,
    clinicalFindings: 'BP 125/82 mmHg, FBS 7.8 mmol/L, no pedal oedema',
    notes: tagged('Patient improving, continue treatment'),
    summary: 'Automated test prescription (full update)',
    height: '171', heightUnit: 'cm',
    weight: '73', weightUnit: 'kg',
    bpSystolic: '125', bpDiastolic: '82',
    pulseRate: '76', temperature: '98.4', oxygenSaturation: '99', respiratoryRate: '18',
    followUpDate: isoDateFromNow(14),
    followUpMode: 'on', followUpValue: 2, followUpType: 'weeks',
    followUpInstructions: 'Repeat HbA1c and lipid profile after 2 weeks',
    referredBy: 'Dr. Karim',
    diagnoses: [diagnosisItem(refs.diagnoses[0], 0, dx.id), diagnosisItem(refs.diagnoses[1], 1)],
    chiefComplaints: [
      { id: cc.id, complaintId: refs.complaints[0].id, term: refs.complaints[0].term, onset: 'Gradual', progression: 'Improving', duration: '3 months',
        aiSuggestedTerm: 'Polydipsia', isVerified: true, isCurrent: false, isPersonalized: false, remarks: 'Better with treatment', sortOrder: 0 },
      { complaintId: refs.complaints[1].id, term: refs.complaints[1].term, onset: 'Acute', progression: 'Static', duration: '2 days',
        aiSuggestedTerm: '', isVerified: false, isCurrent: true, isPersonalized: false, remarks: 'Mild', sortOrder: 1 },
    ],
    medicines: [
      medicineWithDefaultDosage(refs.defaultDosageMedicine, refs.formulation, 0, medId(refs.defaultDosageMedicine)),
      medicineWithDropdownDosage(refs.dropdownDosageMedicine, refs.formulation, UPDATE_CHOICE.dosage, 1, medId(refs.dropdownDosageMedicine)),
    ],
    advices: [adviceItem(refs.advices[0], 0, adv.id), adviceItem(refs.advices[1], 1)],
    investigations: [
      { id: inv.id, testId: refs.tests[0].testId, panelId: refs.tests[0].panelId, name: refs.tests[0].name, abbreviation: refs.tests[0].abbreviation ?? '',
        instructions: 'Fasting 8 hours', isUrgent: true, sortOrder: 0, testResult: '7.9', abnormalFlag: 'High', resultNote: 'Still above target', testDate: isoDateFromNow(-1) },
      { testId: refs.tests[1].testId, panelId: refs.tests[1].panelId, name: refs.tests[1].name, abbreviation: refs.tests[1].abbreviation ?? '',
        instructions: 'Morning sample', isUrgent: false, sortOrder: 1, testResult: '5.1', abnormalFlag: 'Normal', resultNote: 'Within range', testDate: isoDateFromNow(0) },
    ],
    drugHistories: [drugItem(refs.drugs[0], drug.id), drugItem(refs.drugs[1])],
  };
};

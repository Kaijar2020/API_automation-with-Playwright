import { env, idProblems } from '@config';

// Skip reasons for tests that need real staging records.
export const doctorId = env.ids.doctorId;
export const patientId = env.ids.patientId;
export const NEED_DOCTOR = idProblems.DOCTOR_ID ?? '';
export const NEED_PATIENT = [idProblems.DOCTOR_ID, idProblems.PATIENT_ID].filter(Boolean).join('; ');

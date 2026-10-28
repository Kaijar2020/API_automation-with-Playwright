import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

export const ENV_NAME = process.env.ENV ?? 'staging';

// Load .env.<ENV> first, then .env as fallback. Real env vars (CI) always win.
for (const file of [`.env.${ENV_NAME}`, '.env']) {
  const full = path.resolve(__dirname, '..', file);
  if (fs.existsSync(full)) dotenv.config({ path: full, quiet: true });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var "${name}" (ENV=${ENV_NAME})`);
  return value;
}

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Why a doctor/patient id is unusable, shown as the skip reason. */
export const idProblems: Record<string, string> = {};

const optionalId = (name: string) => {
  const v = process.env[name]?.trim();
  if (!v || v === EMPTY_UUID) { idProblems[name] = `Set ${name} in .env.${ENV_NAME}`; return undefined; }
  if (!UUID.test(v)) { idProblems[name] = `${name} must be the UUID from the API, not "${v}"`; return undefined; }
  return v;
};

export const env = {
  name: ENV_NAME,
  baseURL: required('BASE_URL'),
  apiPrefix: process.env.API_PREFIX ?? '/api/v1/prescription',
  timeout: Number(process.env.REQUEST_TIMEOUT ?? 30000),
  logRequests: process.env.LOG_REQUESTS === 'true',
  auth: {
    tokenUrl: required('AUTH_TOKEN_URL'),
    clientId: process.env.AUTH_CLIENT_ID ?? 'niramoy-web',
    username: required('AUTH_USERNAME'),
    password: required('AUTH_PASSWORD'),
  },
  /**
   * The API has no single-prescription delete, so every prescription a test creates stays in the database.
   * The prescription lifecycle (one prescription per run) runs only when this is explicitly true.
   */
  prescriptionWrites: process.env.PRESCRIPTION_WRITES === 'true',
  // Existing records used by read-only tests; tests needing them skip when unset.
  ids: {
    doctorId: optionalId('DOCTOR_ID'),
    patientId: optionalId('PATIENT_ID'),
  },
};

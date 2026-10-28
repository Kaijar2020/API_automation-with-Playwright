// Performance budgets (SLA) and load settings. Every value can be overridden from .env / CI variables.
const num = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

export const perf = {
  /** Default budget per single request */
  sla: {
    read: num('SLA_READ_MS', 1500),    // GET
    write: num('SLA_WRITE_MS', 3000),  // POST / PUT / PATCH / DELETE
  },
  /** Slower endpoints with their own budget. Key: "METHOD /template" as written in the API classes. */
  overrides: {
    'GET /ChiefComplaints/semantic-search': num('SLA_SEMANTIC_SEARCH_MS', 6000), // AI/vector search
    'GET /Prescriptions/{id}/pdf': num('SLA_PDF_MS', 5000),
    'POST /Prescriptions': num('SLA_PRESCRIPTION_CREATE_MS', 5000),
    'POST /prescription-settings/preview': num('SLA_SETTINGS_PREVIEW_MS', 5000), // renders a PDF
  } as Record<string, number>,

  /**
   * In functional runs a request over budget is flagged ("slow" annotation + Allure tag).
   * PERF_ENFORCE=true turns that into a (soft) test failure.
   */
  enforceInFunctionalTests: process.env.PERF_ENFORCE === 'true',

  /** Performance suite (tests/Performance) */
  samples: num('PERF_SAMPLES', 10),        // sequential calls per endpoint (after 1 warm-up)
  concurrency: num('PERF_CONCURRENCY', 10), // parallel calls in the load test
  /** Under concurrent load, p95 may be this many times the single-request budget */
  loadFactor: num('PERF_LOAD_FACTOR', 3),
  /** Largest acceptable response body */
  maxResponseKb: num('PERF_MAX_RESPONSE_KB', 512),
};

export function slaFor(method: string, template: string): number {
  return perf.overrides[`${method} ${template}`] ?? (method === 'GET' ? perf.sla.read : perf.sla.write);
}

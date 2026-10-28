# Prescription API Tests (Playwright)

API test automation for the Niramoy Prescription microservice. Tests follow the Swagger spec (`swagger/prescription.json`): **one folder per Swagger tag**.

## Setup
```bash
npm install
cp .env.example .env.staging   # fill AUTH_USERNAME, AUTH_PASSWORD, DOCTOR_ID, PATIENT_ID (UUIDs)
```
The suite logs in to Keycloak once per run and shares the token with all workers.

## Run
| Command | What it does |
|---|---|
| `npm test` | everything |
| `npx playwright test tests/Advices` | one module |
| `npm run test:smoke` | quick read checks (`@smoke`) |
| `npm run test:readonly` | everything except tests that write data |
| `npm run test:crud` | only tests that write data (`@crud`) |
| `npm run report` | open the HTML report |

## Assertions
Every `expectStatus()` automatically checks:
- status code, `Content-Type: application/json`
- envelope: `success` matches the outcome, `body.status` equals the HTTP status, `error` only on failures, `meta.requestId` present
- response body against the Swagger schema of the endpoint

Extra helpers on every response (chainable):
| Helper | Checks |
|---|---|
| `expectPagination(page, size)` | offset/limit match the request, items <= size, `totalPages = ceil(total/size)`, full pages before the last |
| `expectNotFound()` | 404, `error.code` ends with `NOT_FOUND`, title "Resource Not Found", `success: false` |
| `expectValidationError('field')` | 400 and the named field is reported as invalid |
| `expectUnauthorized()` | 401 and no data in the body |
| `expectRejected(statuses?)` | rejected before reaching the app (e.g. malformed id -> 404 with an empty body), no data |
| `expectSortedBy('key', 'desc')` | order of the items |
| `expectResponseTime(ms?)` | response time within the endpoint budget (or `ms`) |
| `expectMaxSize(kb?)` | response body size |
| `expectHeader(name, value)` | a response header |

## Performance
Every API call's time is recorded. After each run:
- `reports/performance.md` / `.json`: calls, min, avg, p50, p95, max, budget and 5xx per endpoint
- the console lists endpoints whose p95 is over budget
- in Allure, each response attachment shows its time and budget; slow calls are tagged `slow`

Budgets live in `config/performance.ts` (defaults: GET 1500 ms, writes 3000 ms, a few slower endpoints have their own).
In functional runs a slow call is only flagged; set `PERF_ENFORCE=true` to make it fail the test.

Performance suite (`tests/Performance`, **not** part of `npm test`):
```bash
npm run test:perf     # runs one test at a time so timings are not distorted by parallel tests
```
| File | What it measures |
|---|---|
| `response-time.spec.ts` | 1 warm-up + `PERF_SAMPLES` calls per endpoint; p95 must be within budget, body within `PERF_MAX_RESPONSE_KB` |
| `load.spec.ts` | `PERF_CONCURRENCY` parallel calls x 3 waves on the prescription-writing lookups; no errors, p95 within budget x `PERF_LOAD_FACTOR`, throughput reported |
| `paging.spec.ts` | pageSize 100 vs 10 and last page vs first page on the big catalogs |

In GitLab the `api_performance` job runs manually or on a schedule.

## Allure report
```bash
npm test                  # runs tests, writes allure-results/ (cleared at the start of each run)
npm run allure:report     # builds allure-report/ and opens it in the browser
npm run allure:open       # re-open the last built report
npm run test:allure       # both in one go (report opens even if tests fail)
npm run test:allure -- tests/Advices   # same, one module
```
Allure 3 is pure Node (no Java needed). What the report shows:
- **Tree = folder structure**: `Advices` › `Advices - CRUD` › test, same for every folder under `tests/`
- **Steps**: every API call is a step (`POST /Advices`) with the **request** and **response** attached as JSON (the token is never attached)
- **Severity**: `@smoke` = critical, `@crud` = normal, others = minor
- **Tags**: `smoke`, `crud`, and `known-bug` for tests that cover a known API bug
- **Categories**: contract mismatch, unexpected status, login problem, environment unavailable (5xx)
- **Environment**: env name, base URL, Swagger file
- **Trend**: history kept in `allure-history/` between runs

In GitLab CI the report is published as the **"Allure report"** job artifact.

Every run clears `allure-results/` first (any command), so the report never mixes runs; set `ALLURE_KEEP_RESULTS=1` to merge runs on purpose.

Note: `--reporter=...` on the command line replaces every configured reporter (including Allure); run plain `npx playwright test` to get Allure results.

## Structure
```
tests/
  Advices/Advices.spec.ts                         one folder per Swagger tag
  ChiefComplaints/  Diagnosis/  Referrals/  Examinations/  Medicines/
  MedicineFormulationConfigs/  KnownCases/  Investigations/
  DoctorAdviceReferences/  DoctorDiagnosesReferences/  DoctorExaminations/
  DoctorInvestigationReferences/  DoctorMedicineReferences/  DoctorReferralReferences/
  DoctorDictionary/  DoctorDashboard/  Templates/  Prescriptions/  Patients/
  setup/auth.setup.ts                             Keycloak login (runs first)

src/api/                    one class per Swagger tag, one method per endpoint
  CatalogApis.ts            Advices, ChiefComplaints, Diagnosis, Referrals, Examinations, Medicines, ...
  DoctorApis.ts             Doctor* references, DoctorDictionary, DoctorDashboard, Templates
  PrescriptionApis.ts       Prescriptions, Patients
src/fixtures/index.ts       fixtures: advices, prescriptions, templates, ... and anon(Api) for 401 checks
src/data/payloads.ts        request bodies
src/cleanup/                guaranteed test-data clean-up (registry, ledger, end-of-run sweep)
tests/cleanup/              sweep for [AUTO] records left by earlier runs (npm run cleanup:sweep)
src/openapi/                Swagger loader + response schema validation
```

## What each module file tests
- **read** (`@smoke`): list, search, get by id, paging
- **CRUD** (`@crud`): one test per lifecycle, create -> read -> update -> delete as steps; data deleted afterwards even on failure
- **negative / edge cases**: unknown id -> 404 (GET, PUT, DELETE), malformed id rejected, invalid or too long input -> 400, duplicate dictionary shortcut -> 400 `UNIQUE_VIOLATION`, search with no match -> `[]`, no token -> 401 on read **and** write endpoints. Prescriptions: every create sends every field (two medicines, real catalog links); negative tests leave out only the field under test; a doctor who does not own the prescription gets 404 and changes nothing; an update with empty lists clears every section.

Tests that cover a confirmed API bug call `knownBug(...)`: they still fail, tagged `known-bug` in Allure with the bug described. A failure without that tag is a new problem.

Every `expectStatus()` also validates the response body against the Swagger schema for that endpoint.

## Writing a test
```ts
import { test, expect } from '@fixtures';

test('GET /Advices/{id} returns the advice', async ({ advices }) => {
  const advice = (await advices.getById(id)).expectStatus(200);
  expect(advice.isActive).toBe(true);
});
```

## Not tested on purpose
- `DELETE /Prescriptions/doctor/{doctorId}/hard-delete` (wipes all of a doctor's prescriptions; blocked in `ApiClient`)
- `OcrPrescriptions` and `GET /api/v1/Test` (no longer required)

## Test data clean-up (guaranteed)
Test records are named `[AUTO] ...` and are always deleted, whether the test passes, fails, times out or the worker crashes.

| Layer | What it does |
|---|---|
| **Create declares its delete** | Every API method that creates data passes `cleanup` (e.g. `create(data) { return this.post('/Advices', { data, cleanup: this.deleteById('/Advices/{id}') }) }`). `ApiClient` registers the delete the moment the server answers 2xx, before any assertion, so an unexpected 2xx in a negative test is also cleaned up. |
| **After each test** | The auto `cleanup` fixture deletes what the test created, newest first (child before parent). 404 = already gone. Result attached as **Cleanup** in the report; failures are tagged `cleanup-failed`. |
| **Ledger** | Every pending delete is also written to `.cleanup/ledger-<pid>.jsonl`, so a crashed worker or Ctrl+C does not lose it. |
| **End of run** | Global teardown retries anything still pending, writes `reports/cleanup.md` and **fails the run** if a record could not be deleted. |
| **Next run** | Global setup retries leftovers of the previous run first (CI caches `.cleanup/`). |

Each create -> read -> update -> delete flow is **one test with steps**, so a record lives exactly as long as its test.

Rules for new tests: create data only through the API classes (never raw `post()` for creates), and give every new create method a `cleanup`.

Special cases:
- **Prescriptions** have no single-prescription delete, so a created prescription stays in the database. Creating and updating one is still tested, kept to a minimum:
  - opt-in: runs only with `PRESCRIPTION_WRITES=true` (otherwise `PrescriptionsApi.create` refuses real prescriptions);
  - exactly **one** prescription per run (one lifecycle test, retries off), for `DOCTOR_ID` / `PATIENT_ID`, notes starting with `[AUTO]`;
  - its id is listed under "Not deletable" in `reports/cleanup.md`, on the test (`not-deletable` tag) and by `npm run cleanup:sweep`, so the backend team can remove it.

  Once the API offers `DELETE /Prescriptions/{id}`, add it as the `cleanup` of `create` and drop the recording.
- **Bulk wipes are blocked**: any URL containing `hard-delete` (e.g. `DELETE /Prescriptions/doctor/{doctorId}/hard-delete`, which deletes all of a doctor's prescriptions) throws in `ApiClient` and is never replayed by the clean-up.
- **Prescription settings** are only saved for a random test chamber; doctor-level saves are refused.

### Removing old `[AUTO]` data
```bash
npm run cleanup:sweep         # dry run: lists [AUTO] records left by earlier runs -> reports/cleanup-sweep.md
npm run cleanup:sweep:apply   # deletes them
```
Only records whose own name/text starts with `[AUTO] ` are touched. Prescriptions are listed only (no delete endpoint).

import { APIRequestContext, APIResponse, expect, test } from '@playwright/test';
import * as allure from 'allure-js-commons';
import { env } from '@config';
import { perf, slaFor } from '../../config/performance';
import { findOperation, Operation } from '../openapi/spec';
import { checkEnvelope, checkSchema } from '../openapi/validator';
import { recordMetric } from '../perf/metrics';
import { markDeleted, registerCleanup } from '../cleanup/registry';
import { extractId } from '../utils/data';

export type Query = Record<string, string | number | boolean | undefined>;

export interface RequestOptions {
  /** Values for {placeholders} in the path template */
  path?: Record<string, string | number>;
  query?: Query;
  data?: unknown;
  headers?: Record<string, string>;
  /**
   * How to delete what this request creates. Registered as soon as the server answers 2xx,
   * and run after the test whatever its outcome (src/cleanup/registry.ts).
   */
  cleanup?: CleanupBuilder;
}

/** Delete request for a created record; built from the unwrapped response data and the request body. */
export interface CleanupRequest {
  template: string;
  path?: Record<string, string | number>;
  query?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
}
export type CleanupBuilder = (created: any, requestBody: any) => CleanupRequest | undefined;

/** Parsed response + assertion helpers. Contract checks are driven by the Swagger operation. */
export class ApiResult<T = any> {
  constructor(
    readonly method: string,
    readonly template: string,
    readonly operation: Operation | undefined,
    readonly response: APIResponse,
    readonly text: string,
    readonly body: any,
    /** Response time in ms */
    readonly elapsed: number,
    /** Response size in bytes */
    readonly bytes: number,
    /** Response-time budget for this endpoint (config/performance.ts) */
    readonly sla: number,
  ) {}

  get status() { return this.response.status(); }
  /** Unwrapped payload (`body.data` when the server envelope is present) */
  get data(): T { return this.body && typeof this.body === 'object' && 'data' in this.body ? this.body.data : this.body; }
  get pagination() { return this.body?.meta?.pagination; }
  get error() { return this.body?.error; }
  get endpoint() { return `${this.method} ${this.template}`; }

  private describe() {
    return `${this.method} ${this.response.url()} -> ${this.status}\n${this.text.slice(0, 1500)}`;
  }

  /**
   * Assert the status, then validate headers, the envelope and the Swagger schema for that status.
   * Returns the unwrapped data.
   */
  expectStatus(expected: number | number[]): T {
    const allowed = Array.isArray(expected) ? expected : [expected];
    // Assert only on failure so passing tests keep short step titles in the reports.
    if (!allowed.includes(this.status)) {
      expect(this.status, `Expected status ${allowed.join(' or ')}, got ${this.describe()}`).toBe(allowed[0]);
    }
    this.expectContract();
    return this.data;
  }

  /** Headers + envelope + Swagger schema for the actual status (soft: all problems are reported together). */
  expectContract() {
    if (!this.text) return;
    const contentType = this.response.headers()['content-type'] ?? '';
    const problems: string[] = [];
    if (!contentType.includes('application/json')) problems.push(`Content-Type is "${contentType}", expected application/json`);
    else {
      problems.push(...checkEnvelope(this.body, this.status));
      const schemaName = this.operation?.responses[String(this.status)];
      if (schemaName && this.status < 400) problems.push(...checkSchema(schemaName, this.data));
    }
    if (problems.length) {
      expect.soft(problems, `Contract mismatch for ${this.operation?.key ?? this.endpoint}\n${problems.join('\n')}`).toEqual([]);
    }
  }

  /** Response time within `maxMs` (default: the endpoint budget from config/performance.ts). */
  expectResponseTime(maxMs = this.sla) {
    if (this.elapsed > maxMs) {
      expect(this.elapsed, `${this.endpoint} took ${this.elapsed} ms, budget ${maxMs} ms`).toBeLessThanOrEqual(maxMs);
    }
    return this;
  }

  /** Response body not larger than `maxKb`. */
  expectMaxSize(maxKb = perf.maxResponseKb) {
    expect(this.bytes / 1024, `${this.endpoint} response is ${(this.bytes / 1024).toFixed(1)} KB`).toBeLessThanOrEqual(maxKb);
    return this;
  }

  /**
   * Paging metadata matches the request and is internally consistent:
   * offset = page, limit = pageSize, items <= pageSize, totalPages = ceil(totalElements / pageSize),
   * and every page before the last one is full.
   */
  expectPagination(page: number, pageSize: number) {
    const items = this.data as unknown as unknown[];
    const p = this.pagination;
    expect(p, `${this.endpoint} has no meta.pagination`).toBeTruthy();
    expect.soft(p.offset, 'pagination.offset = requested page').toBe(page);
    expect.soft(p.limit, 'pagination.limit = requested pageSize').toBe(pageSize);
    expect.soft(items.length, 'items on the page <= pageSize').toBeLessThanOrEqual(pageSize);
    expect.soft(p.totalPages, 'totalPages = ceil(totalElements / pageSize)').toBe(Math.ceil(p.totalElements / pageSize));
    if (page < p.totalPages) expect.soft(items.length, 'every page before the last is full').toBe(pageSize);
    if (p.totalElements === 0) expect.soft(items, 'no items when totalElements = 0').toHaveLength(0);
    return this;
  }

  /** 404 with the standard error body: title "Resource Not Found" and a *_NOT_FOUND code. */
  expectNotFound() {
    this.expectStatus(404);
    expect.soft(this.error?.code, 'error.code').toMatch(/NOT_FOUND$/);
    expect.soft(this.error?.title, 'error.title').toBe('Resource Not Found');
    expect.soft(this.body?.success, 'success').toBe(false);
    return this;
  }

  /** 400 validation error; optionally the rejected field name (case-insensitive). */
  expectValidationError(field?: string) {
    this.expectStatus(400);
    if (field) {
      // App errors list fields in error.additionalInfo.fields; framework errors use errors: { Field: [...] }.
      const fields = [
        ...(this.error?.additionalInfo?.fields ?? []).map((f: any) => f.field),
        ...Object.keys(this.body?.errors ?? {}),
      ].map(f => String(f).toLowerCase());
      expect.soft(fields.some(f => f.endsWith(field.toLowerCase())), `validation error for "${field}" in ${JSON.stringify(fields)}`).toBe(true);
    }
    return this;
  }

  /** Rejected before reaching the app (e.g. a malformed id fails the route): one of `statuses`, no data. */
  expectRejected(statuses: number[] = [400, 404]) {
    expect(statuses, `${this.endpoint} must be rejected, got ${this.describe()}`).toContain(this.status);
    expect.soft(this.text.includes('"data"'), 'no data in a rejected response').toBe(false);
    return this;
  }

  /** 401 without leaking data. */
  expectUnauthorized() {
    expect(this.status, `${this.endpoint} must require a token`).toBe(401);
    expect.soft(this.text.includes('"data"'), 'no data in a 401 response').toBe(false);
    return this;
  }

  /** Items are sorted by `key`. */
  expectSortedBy(key: string, direction: 'asc' | 'desc' = 'asc') {
    const values = (this.data as unknown as any[]).map(x => x[key]);
    const sorted = [...values].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0) * (direction === 'asc' ? 1 : -1));
    expect(values, `${this.endpoint} sorted by ${key} ${direction}`).toEqual(sorted);
    return this;
  }

  /** Response header equals / matches. */
  expectHeader(name: string, value: string | RegExp) {
    const actual = this.response.headers()[name.toLowerCase()] ?? '';
    if (typeof value === 'string') expect(actual, `header ${name}`).toBe(value);
    else expect(actual, `header ${name}`).toMatch(value);
    return this;
  }
}

/**
 * Generic client. Paths are Swagger templates relative to API_PREFIX, e.g. "/Advices/{id}".
 * Prefix with "~" for paths outside the prefix, e.g. "~/api/v1/Test".
 */
export class ApiClient {
  constructor(protected readonly request: APIRequestContext) {}

  get<T = any>(template: string, opts: RequestOptions = {}) { return this.send<T>('GET', template, opts); }
  post<T = any>(template: string, opts: RequestOptions = {}) { return this.send<T>('POST', template, opts); }
  put<T = any>(template: string, opts: RequestOptions = {}) { return this.send<T>('PUT', template, opts); }
  patch<T = any>(template: string, opts: RequestOptions = {}) { return this.send<T>('PATCH', template, opts); }
  delete<T = any>(template: string, opts: RequestOptions = {}) { return this.send<T>('DELETE', template, opts); }

  static fullPath(template: string) {
    return template.startsWith('~') ? template.slice(1) : `${env.apiPrefix}${template}`;
  }

  static resolveUrl(template: string, path?: Record<string, string | number>) {
    return ApiClient.fullPath(template).replace(/\{(\w+)\}/g, (_, name) => {
      const v = path?.[name];
      if (v === undefined) throw new Error(`Missing path param "${name}" for ${template}`);
      return encodeURIComponent(String(v));
    });
  }

  /** Cleanup for "POST /X" answered with the new record: DELETE `template` with its id (`key` field, else `id`). */
  protected deleteById(template: string, key = 'id'): CleanupBuilder {
    return created => ({ template, path: { id: extractId(created, key) } });
  }

  async send<T = any>(method: string, template: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
    const full = ApiClient.fullPath(template);
    const url = ApiClient.resolveUrl(template, opts.path);
    assertNotBulkWipe(method, url);
    const params = Object.fromEntries(
      Object.entries(opts.query ?? {}).filter(([, v]) => v !== undefined),
    ) as Record<string, string | number | boolean>;

    // Binary endpoints (e.g. /pdf) answer 406 to "Accept: application/json", so prefer their own type.
    const operation = findOperation(method, full);
    const binary = operation?.produces.find(c => c !== 'application/json' && !c.startsWith('text/'));
    const headers = binary ? { Accept: `${binary}, application/json;q=0.9`, ...opts.headers } : opts.headers;
    const sla = slaFor(method, template);

    // Each call is a report step (Allure / HTML) with the request and response attached.
    return test.step(`${method} ${template}`, async () => {
      const started = performance.now();
      const response = await this.request.fetch(url, {
        method,
        params,
        data: opts.data,
        headers,
        timeout: env.timeout,
        failOnStatusCode: false,
      });
      const raw = await response.body();
      const elapsed = Math.round(performance.now() - started);
      const contentType = response.headers()['content-type'] ?? '';
      const isText = !contentType || /json|text|xml/.test(contentType);
      const text = isText ? raw.toString('utf-8') : '';
      let body: any = text;
      try { body = text ? JSON.parse(text) : undefined; } catch { /* non-JSON */ }
      if (env.logRequests) console.log(`${method} ${response.url()} -> ${response.status()} (${elapsed}ms)`);

      await attach('Request', { method, url: response.url(), headers: headers ?? {}, body: opts.data });
      await attach(`Response ${response.status()} (${elapsed} ms, ${(raw.length / 1024).toFixed(1)} KB)`, {
        status: response.status(),
        timeMs: elapsed,
        budgetMs: sla,
        headers: response.headers(),
        body: isText ? body : `<${contentType}, ${raw.length} bytes>`,
      });

      const result = new ApiResult<T>(method, template, operation, response, text, body, elapsed, raw.length, sla);
      trackCleanup(method, template, url, params, opts, result);
      await trackPerformance(`${method} ${template}`, response.status(), elapsed, raw.length, sla);
      return result;
    }, { box: true });
  }
}

/**
 * A 2xx create registers its delete before any assertion can fail; a 2xx DELETE marks the record as gone.
 * If the id cannot be found in the response the record would leak, so the test fails right here.
 */
function trackCleanup(method: string, template: string, url: string, params: Query, opts: RequestOptions, result: ApiResult) {
  if (result.status < 200 || result.status >= 300) return;
  if (method === 'DELETE') return markDeleted(url, params, opts.data);
  if (!opts.cleanup) return;

  let req: CleanupRequest | undefined;
  try {
    req = opts.cleanup(result.data, opts.data);
  } catch (e) {
    throw new Error(`${method} ${template} created a record but its delete could not be registered, so it may stay in the database: ${(e as Error).message}`);
  }
  if (!req) return;
  const deleteUrl = ApiClient.resolveUrl(req.template, req.path);
  const id = Object.values(req.path ?? {}).join('/');
  registerCleanup({ url: deleteUrl, query: req.query, data: req.data, label: `${method} ${template}${id ? ` -> ${id}` : ''}` });
}

/** Record the timing; flag (or with PERF_ENFORCE=true, soft-fail) requests over their budget. */
async function trackPerformance(endpoint: string, status: number, ms: number, bytes: number, sla: number) {
  let info;
  try { info = test.info(); } catch { return; }
  recordMetric({ endpoint, status, ms, bytes, sla, test: info.titlePath.slice(1).join(' › '), at: new Date().toISOString() });
  if (ms <= sla) return;

  info.annotations.push({ type: 'slow', description: `${endpoint} took ${ms} ms (budget ${sla} ms)` });
  await allure.tag('slow');
  if (perf.enforceInFunctionalTests) {
    expect.soft(ms, `${endpoint} took ${ms} ms, budget ${sla} ms`).toBeLessThanOrEqual(sla);
  }
}

/** JSON attachment on the current test; no-op outside a test (e.g. global setup). */
async function attach(name: string, value: unknown) {
  let info;
  try { info = test.info(); } catch { return; }
  const json = JSON.stringify(value, null, 2) ?? '';
  await info.attach(name, { body: json.length > 200_000 ? `${json.slice(0, 200_000)}\n... truncated` : json, contentType: 'application/json' });
}

/**
 * Endpoints that delete many records at once (e.g. DELETE /Prescriptions/doctor/{doctorId}/hard-delete wipes
 * every prescription of a doctor) must never be called by tests, whatever the path or casing.
 */
const FORBIDDEN = [/hard-delete/i];

function assertNotBulkWipe(method: string, url: string) {
  if (FORBIDDEN.some(re => re.test(url))) {
    throw new Error(`Blocked ${method} ${url}: tests must never call endpoints that wipe data in bulk`);
  }
}

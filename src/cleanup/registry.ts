import { APIRequestContext, request, test, TestInfo } from '@playwright/test';
import * as allure from 'allure-js-commons';
import { env } from '@config';
import { getToken } from '@utils/auth';
import { appendEvent, CleanupAction } from './ledger';

/**
 * Guaranteed clean-up of test data.
 *
 * Every API method that creates a record declares how to delete it (RequestOptions.cleanup).
 * ApiClient registers that delete as soon as the server answers 2xx, before any assertion runs,
 * so a failing assertion, a timeout or an unexpected 2xx in a negative test cannot leak data.
 * The auto `cleanup` fixture (src/fixtures) runs the deletes after each test, newest first.
 */

export interface CleanupSpec {
  /** Full path including the API prefix, placeholders already filled in */
  url: string;
  query?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  label: string;
}

/** Pending deletes per test id (records created by that test) */
const byTest = new Map<string, CleanupAction[]>();
/** Keys still pending in this process, so an explicit DELETE in a test can mark them done */
const pendingKeys = new Set<string>();

const normalizeQuery = (q?: CleanupSpec['query']) => {
  const entries = Object.entries(q ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)] as const);
  return entries.length ? Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))) : undefined;
};

export const actionKey = (url: string, query?: CleanupSpec['query'], data?: unknown) =>
  `DELETE ${url.toLowerCase()} ${JSON.stringify(normalizeQuery(query) ?? {})} ${JSON.stringify(data ?? null)}`;

function currentTest(): TestInfo | undefined {
  try { return test.info(); } catch { return undefined; }
}

/** Remember how to delete a record that was just created. */
export function registerCleanup(spec: CleanupSpec) {
  const key = actionKey(spec.url, spec.query, spec.data);
  if (pendingKeys.has(key)) return;
  const info = currentTest();
  const action: CleanupAction = {
    key,
    label: spec.label,
    method: 'DELETE',
    url: spec.url,
    query: normalizeQuery(spec.query),
    data: spec.data,
    test: info?.titlePath.slice(1).join(' › '),
    createdAt: new Date().toISOString(),
  };
  appendEvent({ event: 'created', ...action });
  pendingKeys.add(key);
  if (info) byTest.set(info.testId, [...(byTest.get(info.testId) ?? []), action]);
}

/** A test deleted the record itself (DELETE answered 2xx): nothing left to do for it. */
export function markDeleted(url: string, query?: CleanupSpec['query'], data?: unknown) {
  const key = actionKey(url, query, data);
  if (!pendingKeys.delete(key)) return;
  appendEvent({ event: 'done', key, at: new Date().toISOString() });
  for (const [id, list] of byTest) byTest.set(id, list.filter(a => a.key !== key));
}

export interface CleanupResult { action: CleanupAction; ok: boolean; status: number | string; detail?: string }

/** 2xx = deleted, 404/410 = already gone. 5xx, 429 and network errors are retried. */
async function runOnce(ctx: APIRequestContext, a: CleanupAction): Promise<Omit<CleanupResult, 'action'>> {
  // Clean-up deletes exactly one record (or an explicit id list). Bulk wipes are never replayed, even from an old ledger.
  if (/hard-delete/i.test(a.url)) return { ok: false, status: 'blocked', detail: 'bulk wipe endpoints are never called' };
  try {
    const res = await ctx.fetch(a.url, {
      method: a.method,
      params: a.query,
      data: a.data,
      timeout: env.timeout,
      failOnStatusCode: false,
    });
    const status = res.status();
    if ((status >= 200 && status < 300) || status === 404 || status === 410) return { ok: true, status };
    return { ok: false, status, detail: (await res.text()).slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 'network', detail: String(e).slice(0, 500) };
  }
}

export async function runAction(ctx: APIRequestContext, a: CleanupAction, attempts = 3): Promise<CleanupResult> {
  let last = await runOnce(ctx, a);
  for (let i = 1; i < attempts && !last.ok && last.status !== 'blocked' && (last.status === 'network' || last.status === 429 || Number(last.status) >= 500); i++) {
    await new Promise(r => setTimeout(r, 1000 * i));
    last = await runOnce(ctx, a);
  }
  if (last.ok) {
    pendingKeys.delete(a.key);
    appendEvent({ event: 'done', key: a.key, at: new Date().toISOString() });
  }
  return { action: a, ...last };
}

export async function authedContext() {
  return request.newContext({
    baseURL: env.baseURL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Accept: 'application/json', Authorization: `Bearer ${await getToken()}` },
  });
}

/** Run several deletes newest-first with one fresh context (the test's own context may already be disposed). */
export async function runActions(actions: CleanupAction[]): Promise<CleanupResult[]> {
  if (!actions.length) return [];
  const ctx = await authedContext();
  try {
    const results: CleanupResult[] = [];
    for (const a of [...actions].reverse()) results.push(await runAction(ctx, a));
    return results;
  } finally {
    await ctx.dispose();
  }
}

/** Called by the auto fixture after every test, pass or fail. */
export async function cleanupAfterTest(testInfo: TestInfo) {
  const actions = byTest.get(testInfo.testId) ?? [];
  byTest.delete(testInfo.testId);
  if (!actions.length) return;

  const results = await runActions(actions);
  await testInfo.attach('Cleanup', {
    contentType: 'application/json',
    body: JSON.stringify(results.map(r => ({ label: r.action.label, url: r.action.url, query: r.action.query, status: r.status, ok: r.ok, detail: r.detail })), null, 2),
  });
  const failed = results.filter(r => !r.ok);
  if (!failed.length) return;

  // Left in the ledger: global teardown retries and reports them.
  for (const f of failed) {
    testInfo.annotations.push({ type: 'cleanup-failed', description: `${f.action.label}: DELETE ${f.action.url} -> ${f.status}` });
  }
  try { await allure.tag('cleanup-failed'); } catch { /* reporter not active */ }
}

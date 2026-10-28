import fs from 'fs';
import path from 'path';
import { test } from '@playwright/test';
import * as allure from 'allure-js-commons';

/**
 * Records the API offers no way to delete (prescriptions: no single-prescription delete exists).
 * They are listed per run in reports/cleanup.md and on the test, so the backend team can remove them by id.
 */
const DIR = path.resolve(__dirname, '..', '..', 'reports', 'undeletable');

export interface UndeletableRecord { resource: string; id: string; note: string; test?: string; createdAt: string }

export async function recordUndeletable(resource: string, id: string, note: string) {
  let info;
  try { info = test.info(); } catch { /* outside a test */ }
  const rec: UndeletableRecord = { resource, id, note, test: info?.titlePath.slice(1).join(' › '), createdAt: new Date().toISOString() };
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(path.join(DIR, `records-${process.pid}.jsonl`), JSON.stringify(rec) + '\n');
  if (!info) return;
  info.annotations.push({ type: 'not-deletable', description: `${resource} ${id} stays in the database (no delete endpoint)` });
  try { await allure.tag('not-deletable'); } catch { /* reporter not active */ }
}

/** Records created during this run (the folder is cleared by global setup). */
export function undeletableThisRun(): UndeletableRecord[] {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => f.endsWith('.jsonl'))
    .flatMap(f => fs.readFileSync(path.join(DIR, f), 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)));
}

export function clearUndeletable() {
  fs.rmSync(DIR, { recursive: true, force: true });
}

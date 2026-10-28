import fs from 'fs';
import path from 'path';

/**
 * Persistent record of everything the tests created and how to delete it.
 * One JSONL file per worker process: a "created" line when a record is made, a "done" line once it is gone.
 * Whatever is still pending after a crash, Ctrl+C or a failed delete is retried by global teardown,
 * and again by the next run's global setup.
 */
export const LEDGER_DIR = path.resolve(__dirname, '..', '..', '.cleanup');

/** How to remove one record, stored as data so any process can replay it later. */
export interface CleanupAction {
  /** method + url + query + body: identical deletes share a key */
  key: string;
  /** "Advices 3f2a..." for logs and reports */
  label: string;
  method: 'DELETE';
  /** Full path including the API prefix, placeholders already filled in */
  url: string;
  query?: Record<string, string>;
  data?: unknown;
  /** Test that created the record */
  test?: string;
  createdAt: string;
}

type Event = ({ event: 'created' } & CleanupAction) | { event: 'done'; key: string; at: string };

const file = () => path.join(LEDGER_DIR, `ledger-${process.pid}.jsonl`);

export function appendEvent(e: Event) {
  // Not wrapped in try/catch: losing track of a created record must fail loudly.
  fs.mkdirSync(LEDGER_DIR, { recursive: true });
  fs.appendFileSync(file(), JSON.stringify(e) + '\n');
}

/** Records created in any process (this run or an earlier one) that are not deleted yet. */
export function pendingActions(): CleanupAction[] {
  if (!fs.existsSync(LEDGER_DIR)) return [];
  const pending = new Map<string, CleanupAction>();
  const files = fs.readdirSync(LEDGER_DIR).filter(f => f.endsWith('.jsonl')).sort();
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(LEDGER_DIR, f), 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      const e: Event = JSON.parse(line);
      if (e.event === 'created') {
        const { event: _, ...action } = e;
        pending.set(e.key, action);
      } else pending.delete(e.key);
    }
  }
  return [...pending.values()];
}

/** Replace all ledger files with just the given leftovers (or nothing). */
export function resetLedger(leftovers: CleanupAction[] = []) {
  fs.rmSync(LEDGER_DIR, { recursive: true, force: true });
  if (!leftovers.length) return;
  fs.mkdirSync(LEDGER_DIR, { recursive: true });
  const lines = leftovers.map(a => JSON.stringify({ event: 'created', ...a })).join('\n');
  fs.writeFileSync(path.join(LEDGER_DIR, 'leftovers.jsonl'), lines + '\n');
}

import fs from 'fs';
import path from 'path';
import { pendingActions, resetLedger } from './ledger';
import { runActions } from './registry';
import { undeletableThisRun } from './undeletable';

const REPORT = path.resolve(__dirname, '..', '..', 'reports', 'cleanup.md');

/**
 * Delete every record still pending in the ledger (crashed workers, interrupted runs, failed deletes).
 * Returns what could not be deleted; those stay in the ledger for the next run.
 */
export async function sweepLedger(when: 'before run' | 'after run') {
  const pending = pendingActions();
  if (!pending.length) {
    resetLedger();
    if (when === 'after run') writeReport([], 0);
    return [];
  }
  console.log(`\nTest-data cleanup (${when}): ${pending.length} record(s) still to delete`);
  const results = await runActions(pending);
  const leftovers = results.filter(r => !r.ok);
  resetLedger(leftovers.map(r => r.action));
  if (when === 'after run') writeReport(leftovers, pending.length);

  if (leftovers.length) {
    console.error(`Could NOT delete ${leftovers.length} test record(s); they will be retried on the next run (.cleanup/):`);
    for (const r of leftovers) console.error(`  ${r.action.label}  DELETE ${r.action.url} -> ${r.status} ${r.detail ?? ''}`);
  } else {
    console.log(`  all ${pending.length} deleted`);
  }
  return leftovers;
}

function writeReport(leftovers: Awaited<ReturnType<typeof runActions>>, retried: number) {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  const lines = [
    `# Test-data cleanup - ${new Date().toISOString()}`,
    '',
    leftovers.length
      ? `**${leftovers.length} test record(s) could not be deleted** (retried automatically on the next run):`
      : `All test records were deleted.${retried ? ` (${retried} were removed by the end-of-run sweep.)` : ''}`,
    '',
    ...(leftovers.length
      ? ['| Record | Delete request | Status | Created by |', '|---|---|---|---|',
        ...leftovers.map(r => `| ${r.action.label} | \`DELETE ${r.action.url}${r.action.query ? `?${new URLSearchParams(r.action.query)}` : ''}\` | ${r.status} | ${r.action.test ?? ''} |`)]
      : []),
    ...undeletableSection(),
  ];
  fs.writeFileSync(REPORT, lines.join('\n') + '\n');
}

/** Records the API cannot delete (e.g. prescriptions), listed so the backend team can remove them by id. */
function undeletableSection() {
  const recs = undeletableThisRun();
  if (!recs.length) return [];
  console.warn(`
${recs.length} record(s) created this run have no delete endpoint and stay in the database (see reports/cleanup.md):`);
  for (const r of recs) console.warn(`  ${r.resource} ${r.id}  ${r.note}`);
  return [
    '',
    `## Not deletable: ${recs.length} record(s) stay in the database`,
    'The API has no delete endpoint for these. Ask the backend team to remove them by id.',
    '',
    '| Resource | Id | Note | Created by | Created at |', '|---|---|---|---|---|',
    ...recs.map(r => `| ${r.resource} | \`${r.id}\` | ${r.note} | ${r.test ?? ''} | ${r.createdAt} |`),
  ];
}

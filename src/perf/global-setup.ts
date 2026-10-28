import fs from 'fs';
import path from 'path';
import { METRICS_DIR } from './metrics';
import { sweepLedger } from '../cleanup/sweep-ledger';
import { clearUndeletable } from '../cleanup/undeletable';

// Every run starts clean, whatever command started it (npm test, npx playwright test, VS Code):
// - performance metrics, so reports/performance.md covers this run only
// - allure-results, so the Allure report never mixes old runs (set ALLURE_KEEP_RESULTS=1 to merge runs on purpose)
// - test records a previous run could not delete (crash, Ctrl+C, server down) are deleted first
export default async function globalSetup() {
  fs.rmSync(METRICS_DIR, { recursive: true, force: true });
  if (!process.env.ALLURE_KEEP_RESULTS) {
    fs.rmSync(path.resolve(__dirname, '..', '..', 'allure-results'), { recursive: true, force: true });
  }
  clearUndeletable();
  await sweepLedger('before run');
}

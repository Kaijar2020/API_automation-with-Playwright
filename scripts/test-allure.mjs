// Runs the tests, then always builds + opens the Allure report (even when tests fail).
// Cross-platform replacement for "npm test; npm run allure:report". Extra args go to Playwright:
//   npm run test:allure -- tests/Advices
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: true }).status ?? 1;

rmSync('allure-results', { recursive: true, force: true });
// Allure writes into a subfolder when old files are left behind, so always start from an empty report folder.
rmSync('allure-report', { recursive: true, force: true });
const testExit = run('npx', ['playwright', 'test', ...process.argv.slice(2)]);
// ALLURE_NO_OPEN=1 builds the report without starting the local server (CI, scripts).
run('npx', ['allure', 'generate', 'allure-results', ...(process.env.ALLURE_NO_OPEN ? [] : ['--open'])]);
process.exit(testExit);

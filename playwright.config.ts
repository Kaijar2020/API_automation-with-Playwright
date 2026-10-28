import { defineConfig } from '@playwright/test';
import { env } from './config/env';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Collects every request's timing; teardown writes reports/performance.{md,json}
  globalSetup: './src/perf/global-setup.ts',
  globalTeardown: './src/perf/global-teardown.ts',
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['allure-playwright', {
      resultsDir: 'allure-results',
      suiteTitle: false,
      environmentInfo: {
        Environment: env.name,
        'Base URL': env.baseURL,
        'API prefix': env.apiPrefix,
        Swagger: process.env.SWAGGER_FILE ?? 'swagger/prescription.json',
        Node: process.version,
      },
      categories: [
        { name: 'Performance budget exceeded', messageRegex: '.*(budget|allowed) \d+ ms.*' },
        { name: 'Swagger contract mismatch', messageRegex: '.*Contract mismatch.*' },
        { name: 'Unexpected status code', messageRegex: '.*Expected status.*' },
        { name: 'Login / token problem', messageRegex: '.*Token request failed.*' },
        { name: 'Test data not cleaned up', messageRegex: '.*(could not be registered|still in the database|Refusing to create).*' },
        { name: 'Environment unavailable (5xx / gateway)', messageRegex: '.*-> (5\\d\\d|522).*' },
        { name: 'Assertion failed', matchedStatuses: ['failed'] },
        { name: 'Test code error', matchedStatuses: ['broken'] },
      ],
    }],
  ],
  use: {
    baseURL: env.baseURL,
    extraHTTPHeaders: { Accept: 'application/json' },
    ignoreHTTPSErrors: true,
  },
  projects: [
    // Fails fast if Keycloak login is broken, before running every spec.
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    { name: 'api', testMatch: /.*\.spec\.ts/, testIgnore: /Performance/, dependencies: ['setup'] },
    // Performance suite runs only on demand (npm run test:perf) so normal runs don't load the server.
    ...(process.env.PERF
      ? [{ name: 'performance', testMatch: /Performance[\\/].*\.spec\.ts/, fullyParallel: false, timeout: 300_000, dependencies: ['setup'] }]
      : []),
    // Removes "[AUTO]" records left by earlier runs (npm run cleanup:sweep / cleanup:sweep:apply).
    ...(process.env.SWEEP
      ? [{ name: 'cleanup', testMatch: /cleanup[\\/].*\.cleanup\.ts/, fullyParallel: false, timeout: 600_000, dependencies: ['setup'] }]
      : []),
  ],
});

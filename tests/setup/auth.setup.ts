import { test as setup, expect } from '@playwright/test';
import { loginAndStoreToken } from '@utils/auth';
import { applyAllureLabels } from '@utils/allure';

// Keycloak password grant. Runs once; all specs reuse this token.
setup('authenticate against Keycloak', async ({}, testInfo) => {
  await applyAllureLabels(testInfo);
  const { token, expiresAt } = await loginAndStoreToken();
  expect(token.split('.')).toHaveLength(3);
  expect(expiresAt).toBeGreaterThan(Date.now());
});

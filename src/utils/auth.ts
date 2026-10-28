import { request } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { env, ENV_NAME } from '@config';

// One Keycloak login per run: setup writes the token to a file, workers read it.
// Logging in from every parallel worker at once gets rejected by Keycloak ("Invalid user credentials").
const TOKEN_FILE = path.resolve(__dirname, '..', '..', '.auth', `${ENV_NAME}.json`);
const REFRESH_MARGIN_MS = 30_000;

type StoredToken = { token: string; expiresAt: number };

export async function fetchToken(): Promise<{ token: string; expiresIn: number }> {
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const res = await ctx.post(env.auth.tokenUrl, {
      form: {
        grant_type: 'password',
        client_id: env.auth.clientId,
        username: env.auth.username,
        password: env.auth.password,
      },
    });
    if (!res.ok()) throw new Error(`Token request failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    return { token: body.access_token, expiresIn: body.expires_in };
  } finally {
    await ctx.dispose();
  }
}

/** Called once from auth.setup.ts. */
export async function loginAndStoreToken(): Promise<StoredToken> {
  const { token, expiresIn } = await fetchToken();
  const stored = { token, expiresAt: Date.now() + expiresIn * 1000 };
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(stored));
  return stored;
}

let refreshing: Promise<StoredToken> | undefined;

/** Stored token, re-logging in only if it is about to expire (long runs). */
export async function getToken(): Promise<string> {
  const stored: StoredToken | undefined = fs.existsSync(TOKEN_FILE)
    ? JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'))
    : undefined;
  if (stored && Date.now() < stored.expiresAt - REFRESH_MARGIN_MS) return stored.token;
  refreshing ??= loginAndStoreToken().finally(() => (refreshing = undefined));
  return (await refreshing).token;
}

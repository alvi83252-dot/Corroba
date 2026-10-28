/**
 * Mitel CloudLink Authentication API
 * OAuth2 password / client_credentials grant → Bearer access token
 * Token URL: https://authentication.eu.api.mitel.io/2017-09-01/token
 */

export interface MitelTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

const DEFAULT_AUTH_BASE = 'https://authentication.eu.api.mitel.io/2017-09-01';

export function getMitelAuthBaseUrl(): string {
  return (process.env.MITEL_AUTH_URL ?? process.env.UNIFY_AUTH_URL ?? DEFAULT_AUTH_BASE).replace(/\/$/, '');
}

export function isMitelOAuthConfigured(): boolean {
  const clientId = process.env.MITEL_CLIENT_ID?.trim();
  const clientSecret = process.env.MITEL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return false;

  const hasPasswordGrant =
    Boolean(process.env.MITEL_USERNAME?.trim()) && Boolean(process.env.MITEL_PASSWORD?.trim());
  const hasClientGrant = Boolean(process.env.MITEL_ACCOUNT_ID?.trim());

  return hasPasswordGrant || hasClientGrant;
}

/** Static bearer token fallback (legacy UNIFY_API_KEY) */
export function getStaticMitelBearerToken(): string | null {
  const key = process.env.UNIFY_API_KEY?.trim() || process.env.MITEL_API_KEY?.trim();
  return key || null;
}

export function isMitelAuthConfigured(): boolean {
  return isMitelOAuthConfigured() || Boolean(getStaticMitelBearerToken());
}

function buildTokenRequestBody(): URLSearchParams {
  const clientId = process.env.MITEL_CLIENT_ID!.trim();
  const clientSecret = process.env.MITEL_CLIENT_SECRET!.trim();
  const username = process.env.MITEL_USERNAME?.trim();
  const password = process.env.MITEL_PASSWORD?.trim();
  const accountId = process.env.MITEL_ACCOUNT_ID?.trim();

  const params = new URLSearchParams();
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);

  if (username && password) {
    params.set('grant_type', 'password');
    params.set('username', username);
    params.set('password', password);
    params.set('scope', process.env.MITEL_SCOPE?.trim() || 'principal');
    if (accountId) params.set('account_id', accountId);
  } else {
    params.set('grant_type', 'client_credentials');
    if (accountId) params.set('account_id', accountId);
  }

  return params;
}

async function requestAccessToken(): Promise<CachedToken> {
  const tokenUrl = `${getMitelAuthBaseUrl()}/token`;
  const body = buildTokenRequestBody();

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: body.toString()
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Mitel auth token error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as MitelTokenResponse;
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(expiresIn - 60, 30) * 1000
  };
}

/** Obtain a CloudLink bearer token (cached until expiry) */
export async function getMitelAccessToken(): Promise<string> {
  const staticToken = getStaticMitelBearerToken();
  if (!isMitelOAuthConfigured()) {
    if (staticToken) return staticToken;
    throw new Error('Mitel CloudLink credentials are not configured');
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  cachedToken = await requestAccessToken();
  return cachedToken.accessToken;
}

export function clearMitelTokenCache(): void {
  cachedToken = null;
}

export function getMitelAuthStatus() {
  return {
    configured: isMitelAuthConfigured(),
    oauth: isMitelOAuthConfigured(),
    staticToken: Boolean(getStaticMitelBearerToken()),
    authUrl: `${getMitelAuthBaseUrl()}/token`,
    grantType: process.env.MITEL_USERNAME ? 'password' : process.env.MITEL_ACCOUNT_ID ? 'client_credentials' : null
  };
}

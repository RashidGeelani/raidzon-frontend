import { db, sessionId } from '../../matches/data/match-repository';

export interface AccountSession {
  token: string;
  expiresAt: number;
  accountId: string;
  deviceId: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown, token?: string, timeoutMs = 15_000): Promise<T> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      'The sign-in server is unavailable. Your matches are saved on this device.',
    );
  }
  if (!response.ok)
    throw new ApiError(response.status, data.message ?? 'The request could not be completed.');
  return data as T;
}
/** The API origin, e.g. https://raidzon-backend.onrender.com, or '' for same-origin deployments. */
export const apiBaseUrl = () => (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
export async function deviceCredentials(database = db) {
  const deviceId = await sessionId(database);
  const deviceSecret = await database.transaction('rw', database.metadata, async () => {
    const saved = await database.metadata.get('device-secret');
    if (saved) return saved.value;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const value = btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
    await database.metadata.add({ key: 'device-secret', value });
    return value;
  });
  return { deviceId, deviceSecret };
}

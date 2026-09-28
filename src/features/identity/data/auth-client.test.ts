import { afterEach, expect, it, vi } from 'vitest';
import { api } from './auth-client';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('uses the configured backend base URL for API requests', async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/');
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal('fetch', fetchMock);

  await api('/auth/capabilities');

  expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/v1/auth/capabilities');
});

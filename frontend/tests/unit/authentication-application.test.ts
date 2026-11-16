import { describe, expect, it, vi } from 'vitest';
import { createAuthentication } from '@/modules/authentication/application/authentication';
import type { SessionPort } from '@/modules/authentication/application/session-ports';

describe('authentication application ports', () => {
  const session = (): SessionPort => ({ initialize: vi.fn(async () => {}), login: vi.fn(async () => {}), logout: vi.fn(async () => {}), invalidate: vi.fn(), snapshot: () => ({ status: 'anonymous' }), subscribe: () => () => {} });
  it('coordinates replaceable ports without a browser provider', async () => {
    const port = session();
    const user = { id: 'subject-1', name: null, username: null, email: null, roles: [] };
    const auth = createAuthentication(port, { read: async () => user });
    await auth.initialize(); await auth.login('https://untrusted.invalid');
    expect(port.login).toHaveBeenCalledWith('/session', undefined);
    await auth.login('/invitations/accept');
    expect(port.login).toHaveBeenLastCalledWith('/invitations/accept', undefined);
    expect(await auth.readUser()).toEqual(user);
    await auth.logout(); expect(port.logout).toHaveBeenCalledOnce();
  });
  it('preserves user lookup errors without manufacturing an identity', async () => {
    const auth = createAuthentication(session(), { read: async () => { throw new Error('unavailable'); } });
    await expect(auth.readUser()).rejects.toThrow('unavailable');
  });
});

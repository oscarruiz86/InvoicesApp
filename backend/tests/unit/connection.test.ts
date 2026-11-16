import { describe, expect, it, vi } from 'vitest';
import type { Connection } from 'mongoose';
import { createConnectionManager } from '@/shared/infrastructure/mongodb/connection';

describe('lazy MongoDB connection', () => {
  it('shares concurrent attempts and the established pool', async () => {
    const connection = { readyState: 1, close: vi.fn() } as unknown as Connection;
    const open = vi.fn().mockResolvedValue(connection);
    const manager = createConnectionManager(open);
    expect(open).not.toHaveBeenCalled();
    const result = await Promise.all([manager.connect('uri'), manager.connect('uri')]);
    expect(result).toEqual([connection, connection]);
    expect(await manager.connect('uri')).toBe(connection);
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('clears rejected attempts and allows recovery', async () => {
    const connection = { readyState: 1, close: vi.fn() } as unknown as Connection;
    const open = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(connection);
    const manager = createConnectionManager(open);
    await expect(manager.connect('uri')).rejects.toThrow('offline');
    expect(await manager.connect('uri')).toBe(connection);
    expect(open).toHaveBeenCalledTimes(2);
    await manager.close();
    expect(connection.close).toHaveBeenCalledOnce();
  });
  it('preserves an established pool while its driver reconnects', async () => {
    const connection = { readyState: 1, close: vi.fn() } as unknown as Connection;
    const open = vi.fn().mockResolvedValue(connection);
    const manager = createConnectionManager(open);
    await manager.connect('uri');
    Object.assign(connection, { readyState: 0 });
    expect(await manager.connect('uri')).toBe(connection);
    expect(open).toHaveBeenCalledOnce();
  });
});

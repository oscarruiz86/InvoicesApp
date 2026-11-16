import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { NotificationRecord } from '@/modules/notifications/domain/notification';
import { createAesPayloadCipher } from '@/modules/notifications/infrastructure/payload-cipher';
import { formatInvitationRoles, renderInvitationTemplate } from '@/modules/notifications/infrastructure/templates';
import { createSmtpTransport } from '@/modules/notifications/infrastructure/smtp-transport';
import { createNotificationWorker } from '@/modules/notifications/infrastructure/worker';
import { NotificationTransportError } from '@/modules/notifications/application/ports';

it('encrypts invitation payloads with authenticated AES-256-GCM', async () => {
  const token = 'private-token'; const key = randomBytes(32).toString('base64');
  const cipher = createAesPayloadCipher({ read: async () => key }, 'key-file');
  const encrypted = await cipher.encrypt({ token });
  expect(JSON.stringify(encrypted)).not.toContain(token);
  await expect(cipher.decrypt(encrypted)).resolves.toEqual({ token });
  await expect(cipher.decrypt({ ...encrypted, tag: Buffer.alloc(16).toString('base64') })).rejects.toThrow();
});

it('uses the shared Spanish role catalog in invitation emails', () => {
  expect(formatInvitationRoles(['COMPANY_ADMIN'])).toBe('Administrador de empresa');
  expect(formatInvitationRoles(['THIRD_PARTY_ADMIN', 'DRIVER'])).toBe('Administrador de tercero, Conductor');
  expect(() => formatInvitationRoles(['UNKNOWN_ROLE'])).toThrow();
});
it('renders only declared variables and escapes HTML interpolations', () => {
  const result = renderInvitationTemplate({ type: 'INVITATION_CREATED', language: 'es', values: {
    organizationName: '<Empresa & Co>', roles: 'COMPANY_ADMIN', expiresAt: '2026-11-20', link: 'https://app.invalid/#token',
  } });
  expect(result.subject).toContain('<Empresa & Co>');
  expect(result.html).toContain('&lt;Empresa &amp; Co&gt;');
  expect(() => renderInvitationTemplate({ type: 'INVITATION_CREATED', language: 'en', values: {} })).toThrow();
  expect(() => renderInvitationTemplate({ type: 'INVITATION_CREATED', language: 'es', values: {
    organizationName: 'X', roles: 'DRIVER', expiresAt: 'tomorrow', link: 'https://app.invalid', unexpected: 'x',
  } })).toThrow();
});

function notification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return { id: 'n1', type: 'INVITATION_CREATED', channel: 'email', recipient: 'person@example.invalid', language: 'es', functionalReference: 'i1',
    idempotencyKey: 'a1', payload: { ciphertext: 'c', iv: 'i', tag: 't', keyVersion: 1 }, expiresAt: new Date('2026-11-14T12:00:00Z'),
    createdAt: new Date('2026-11-13T12:00:00Z'), status: 'PROCESSING', attempts: 1, nextAttemptAt: new Date('2026-11-13T12:00:00Z'),
    leaseUntil: null, owner: 'worker', terminalFailure: null, projectionPending: false, projectionStatus: null,
    projectionData: { invitationId: 'i1', tokenVersion: 1, attemptId: 'a1' }, ...overrides };
}
function workerFixture(record = notification()) {
  const repo = { claimProjection: vi.fn(async () => null), claimDue: vi.fn(async () => record), finishAttempt: vi.fn(async () => {}), finishProjection: vi.fn(async () => {}) };
  const transport = { send: vi.fn(async () => ({ serverReference: null })) };
  const worker = createNotificationWorker({ repository: repo, cipher: { encrypt: async value => value as never, decrypt: async <T,>() => ({ token: 'token', organizationName: 'Empresa', roles: ['DRIVER'] } as T) },
    configuration: { enabled: true, publicOrigin: 'https://app.example.invalid', fromAddress: 'no-reply@example.invalid', fromName: 'Invoices',
      smtp: { host: 'localhost', port: 25, tlsMode: 'plain', timeoutMs: 1000 } }, projection: { update: async () => {} }, isDeliverable: async () => true,
    now: () => new Date('2026-11-13T12:00:00Z'), owner: 'worker-1', transport });
  return { repo, transport, worker };
}
it('schedules a transient SMTP failure after one minute without leaking the message', async () => {
  const f = workerFixture(); f.transport.send.mockRejectedValueOnce(new NotificationTransportError('SMTP_TEMPORARY'));
  await f.worker.processOne();
  expect(f.repo.finishAttempt).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'RETRY', failure: 'SMTP_TEMPORARY',
    nextAttemptAt: new Date('2026-11-13T12:01:00Z') }));
  expect(JSON.stringify(f.repo.finishAttempt.mock.calls)).not.toContain('person@example.invalid');
});
it('suppresses an invitation that is no longer deliverable without contacting SMTP', async () => {
  const f = workerFixture();
  const worker = createNotificationWorker({ repository: f.repo, cipher: { encrypt: async value => value as never, decrypt: async <T,>() => ({} as T) },
    configuration: { enabled: true, publicOrigin: 'https://app.example.invalid', fromAddress: 'no-reply@example.invalid', fromName: '', smtp: { host: 'x', port: 25, tlsMode: 'plain', timeoutMs: 1000 } },
    projection: { update: async () => {} }, isDeliverable: async () => false, now: () => new Date('2026-11-13T12:00:00Z'), owner: 'worker-1', transport: f.transport });
  await worker.processOne();
  expect(f.transport.send).not.toHaveBeenCalled();
  expect(f.repo.finishAttempt).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SUPPRESSED', project: false }));
});

it('sends a UTF-8 message over the configured plain SMTP transport in local mode', async () => {
  const received: string[] = []; const server = createServer(socket => {
    socket.write('220 localhost ready\r\n'); let buffer = ''; let inData = false;
    socket.on('data', chunk => { buffer += chunk.toString(); let index: number;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        if (inData) { if (line === '.') { inData = false; socket.write('250 accepted\r\n'); } else received.push(line); continue; }
        if (line === 'DATA') { inData = true; socket.write('354 continue\r\n'); }
        else if (line === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
        else if (line.startsWith('EHLO')) socket.write('250-localhost\r\n250 OK\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No SMTP test address');
  try {
    const transport = createSmtpTransport({ host: '127.0.0.1', port: address.port, tlsMode: 'plain', timeoutMs: 1000 });
    await expect(transport.send({ to: 'person@example.invalid', fromAddress: 'no-reply@example.invalid', fromName: 'Invoices', subject: 'Invitación', text: 'Hola', html: '<p>Hola</p>' })).resolves.toEqual({ serverReference: null });
    expect(received.join('\n')).toContain('Content-Type: text/plain; charset=utf-8');
    expect(received.join('\n')).toContain('Content-Type: text/html; charset=utf-8');
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

it('decrypts pending notification payloads during versioned key rotation', async () => {
  const keys = { 1: randomBytes(32).toString('base64'), 2: randomBytes(32).toString('base64') };
  const secrets = { read: async (reference: string) => keys[Number(reference.slice(-1)) as 1 | 2] };
  const oldCipher = createAesPayloadCipher(secrets, { activeVersion: 1, keyFiles: { 1: 'key-v1' } });
  const oldPayload = await oldCipher.encrypt({ token: 'still-pending' });
  const rotatedCipher = createAesPayloadCipher(secrets, { activeVersion: 2, keyFiles: { 1: 'key-v1', 2: 'key-v2' } });
  const newPayload = await rotatedCipher.encrypt({ token: 'new-work' });
  await expect(rotatedCipher.decrypt(oldPayload)).resolves.toEqual({ token: 'still-pending' });
  await expect(rotatedCipher.decrypt(newPayload)).resolves.toEqual({ token: 'new-work' });
  expect(oldPayload.keyVersion).toBe(1);
  expect(newPayload.keyVersion).toBe(2);
});

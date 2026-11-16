import { expect, it } from 'vitest';
import { hashInvitationToken, issueInvitationCredential, issueInvitationToken, matchesInvitationToken } from '@/modules/organizations/infrastructure/invitation-tokens';

it('issues a high-entropy token and verifies only its persisted hash', () => {
  const issued = issueInvitationToken();
  expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(issued.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  expect(issued.tokenHash).not.toContain(issued.token);
  expect(matchesInvitationToken(issued.token, issued.tokenHash)).toBe(true);
  expect(matchesInvitationToken('wrong-token', issued.tokenHash)).toBe(false);
  expect(matchesInvitationToken(issued.token, hashInvitationToken('other-token'))).toBe(false);
});

it('applies the configured invitation lifetime', () => {
  const now = new Date('2026-11-12T12:00:00.000Z');
  expect(issueInvitationCredential(now, 72).expiresAt).toEqual(new Date('2026-11-15T12:00:00.000Z'));
  expect(() => issueInvitationCredential(now, 0)).toThrow('INVITATION_TTL_INVALID');
});

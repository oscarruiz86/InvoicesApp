export const colombianDocumentTypes = ['CC', 'CE', 'TI', 'RC', 'PA', 'PPT'] as const;
export type ColombianDocumentType = typeof colombianDocumentTypes[number];

export interface IdentityProfile {
  readonly subject: string;
  readonly enabled: boolean;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly fullName: string | null;
  readonly documentType: ColombianDocumentType | null;
  readonly documentNumber: string | null;
  readonly profileComplete: boolean;
}

export interface IdentityProfileReader {
  read(subject: string): Promise<IdentityProfile | null>;
}

export class IdentityProfileUnavailable extends Error {
  constructor() { super('IDENTITY_UNAVAILABLE'); }
}

export type InvitationIdentityFailure = 'IDENTITY_MISMATCH' | 'EMAIL_UNVERIFIED' | 'PROFILE_INCOMPLETE' | 'IDENTITY_UNAVAILABLE';
export class InvitationIdentityError extends Error {
  constructor(readonly code: InvitationIdentityFailure) { super(code); }
}

export interface InvitationIdentityEvidence {
  readonly subject: string;
  readonly email: string;
  readonly emailVerified: true;
  readonly profileComplete: true;
}

const normalizeEmail = (value: string) => value.trim().toLocaleLowerCase('en-US');

export async function readInvitationIdentity(reader: IdentityProfileReader, input: { subject: string; recipientEmail: string }): Promise<InvitationIdentityEvidence> {
  let profile: IdentityProfile | null;
  try { profile = await reader.read(input.subject); }
  catch { throw new InvitationIdentityError('IDENTITY_UNAVAILABLE'); }
  if (!profile || !profile.enabled || profile.subject !== input.subject || !profile.email
    || normalizeEmail(profile.email) !== normalizeEmail(input.recipientEmail)) throw new InvitationIdentityError('IDENTITY_MISMATCH');
  if (!profile.emailVerified) throw new InvitationIdentityError('EMAIL_UNVERIFIED');
  if (!profile.profileComplete) throw new InvitationIdentityError('PROFILE_INCOMPLETE');
  return { subject: profile.subject, email: normalizeEmail(profile.email), emailVerified: true, profileComplete: true };
}

import type { SessionUser } from '../domain/user';

export type SessionStatus = 'initializing' | 'anonymous' | 'authenticating' | 'authenticated' | 'refreshing' | 'signingOut' | 'error';
export type SessionFailure = 'CONFIGURATION' | 'AUTHENTICATION' | 'SESSION_EXPIRED' | 'LOGOUT_UNCONFIRMED';
export interface SessionSnapshot { readonly status: SessionStatus; readonly error?: SessionFailure; readonly credentialRevision?: number; readonly returnPath?: '/session' | '/invitations/accept' | '/invitations/received' }
export interface LoginOptions { readonly action?: 'register' | 'switch-account'; readonly loginHint?: string }
export interface SessionPort {
  initialize(): Promise<void>;
  login(returnPath?: string, options?: LoginOptions): Promise<void>;
  openAccountManagement?(): Promise<void>;
  logout(): Promise<void>;
  invalidate(): void;
  snapshot(): SessionSnapshot;
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void;
}
/** The credential is consumed only by infrastructure, never copied to presentation state. */
export interface AccessTokenPort { getAccessToken(): Promise<string> }
export interface CurrentUserPort { read(signal?: AbortSignal): Promise<SessionUser> }

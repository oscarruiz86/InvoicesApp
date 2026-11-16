import type { ContextStore } from '@/modules/organization-context/presentation/context-store';

export async function activateInvitationContext(context: ContextStore | undefined, organizationId: string, organizationType: 'COMPANY' | 'THIRD_PARTY'): Promise<boolean> {
  if (!context) return false;
  try {
    await context.getState().select({ kind: 'ORGANIZATION', organizationId, organizationType }, 'SWITCH');
    const state = context.getState();
    return state.status === 'ready' && state.activeContext?.kind === 'ORGANIZATION'
      && state.activeContext.organizationId === organizationId && state.activeContext.organizationType === organizationType;
  } catch { return false; }
}

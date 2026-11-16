import { expect, it } from 'vitest';
import { retiredCompanyAssociationResponse } from '@/modules/organizations/presentation/companies';

it('rejects legacy direct association writes without touching membership data', async () => {
  const response = retiredCompanyAssociationResponse();
  expect(response.status).toBe(410);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({ error: { code: 'INVITATION_FLOW_REQUIRED', message: 'La asociación directa fue retirada. Use el flujo de invitaciones.' } });
});

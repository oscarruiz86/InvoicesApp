import { expect, it } from 'vitest';
import { auditActionLabel } from '@/modules/audit/presentation/audit-labels';

it('shows normalized audit actions as natural Spanish while retaining unknown code readability', () => {
  expect(auditActionLabel('VEHICLE_UPDATED','fleet')).toBe('Vehículo actualizado');
  expect(auditActionLabel('INVOICE_CREATED','invoices')).toBe('Factura creada');
  expect(auditActionLabel('CONTEXT_SWITCH_REQUESTED','organizations')).toBe('Cambio de contexto solicitado');
  expect(auditActionLabel('COMPANY_ADMIN_ASSOCIATED','organizations')).toBe('Administrador de empresa asociado');
  expect(auditActionLabel('CUSTOM_ACTION')).toBe('custom action');
});

it('humanizes Keycloak administration actions', () => {
  expect(auditActionLabel('KEYCLOAK_ADMIN_CREATE_USER','keycloak-admin')).toBe('Administración de Keycloak: creó un usuario');
});

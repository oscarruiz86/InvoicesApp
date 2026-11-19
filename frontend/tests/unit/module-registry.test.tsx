import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { markerModules, MarkerModulePage } from '@/app/module-registry';

describe('declarative marker modules', () => {
  it('registers unique routes for every planned marker module with read permission and a context requirement', () => {
    expect(new Set(markerModules.map(module => module.path)).size).toBe(markerModules.length);
    expect(markerModules.map(module => module.key)).toEqual(['drivers', 'vehicles', 'notification-deliveries', 'assignments', 'invoices', 'parameters', 'audit']);
    expect(markerModules.every(module => module.path.startsWith('/') && module.permission.endsWith(':read') && Boolean(module.context))).toBe(true);
    expect(markerModules.find(module => module.key === 'notification-deliveries')).toMatchObject({ path: '/notification-deliveries', permission: 'notifications:deliveries:read' });
  });
  it('renders an honest integration marker for pages whose service is not wired yet', () => {
    render(<MarkerModulePage module={markerModules[0]} />);
    expect(screen.getByRole('heading', { name: 'Conductores' })).toBeInTheDocument();
    expect(screen.getByText(/interfaz frontend está preparada; falta conectar el servicio/i)).toBeInTheDocument();
  });
});

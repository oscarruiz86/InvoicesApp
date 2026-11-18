import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { markerModules, MarkerModulePage } from '@/app/module-registry';

describe('declarative marker modules', () => {
  it('registers unique routes for every planned marker module with read permission and a context requirement', () => {
    expect(new Set(markerModules.map(module => module.path)).size).toBe(markerModules.length);
    expect(markerModules.map(module => module.key)).toEqual(['drivers', 'vehicles', 'assignments', 'invoices', 'parameters', 'roles', 'audit']);
    expect(markerModules.every(module => module.path.startsWith('/') && module.permission.endsWith(':read') && Boolean(module.context))).toBe(true);
  });
  it('renders an honest integration marker without inventing module operations', () => {
    render(<MarkerModulePage module={markerModules[0]} />);
    expect(screen.getByRole('heading', { name: 'Conductores' })).toBeInTheDocument();
    expect(screen.getByText(/aún no incluye operaciones/i)).toBeInTheDocument();
  });
});

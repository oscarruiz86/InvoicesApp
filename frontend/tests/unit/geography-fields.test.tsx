import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { CatalogApi, CatalogOption } from '@/modules/parameter-management/application/catalog-api';
import { GeographyFields, type GeographyValue } from '@/modules/parameter-management/presentation/geography-fields';

const option = (catalog: CatalogOption['catalog'], code: string, label: string, parentCode: string | null): CatalogOption => ({ catalog, code, label, parentCode,
  territoryType: catalog === 'municipalities' ? 'Municipio' : null, active: true, version: 1, source: 'test', updatedAt: new Date().toISOString(), updatedBy: 'test' });

function Harness({ api }: { api: CatalogApi }) {
  const [value, setValue] = useState<GeographyValue>({ country: '', department: '', city: '' });
  return <><GeographyFields api={api} value={value} onChange={setValue} /><output>{JSON.stringify(value)}</output></>;
}

afterEach(cleanup);

it('loads options by parent and clears descendant codes when an ancestor changes', async () => {
  const user = userEvent.setup();
  const api: CatalogApi = { list: vi.fn(async (catalog, parentCode) => catalog === 'countries'
    ? [option('countries', 'CO', 'Colombia', null), option('countries', 'US', 'Estados Unidos', null)]
    : catalog === 'departments' && parentCode === 'CO' ? [option('departments', '05', 'Antioquia', 'CO')]
      : catalog === 'departments' && parentCode === 'US' ? [option('departments', '01', 'Alabama', 'US')]
        : catalog === 'municipalities' && parentCode === '05' ? [option('municipalities', '05001', 'Medellín', '05')]
          : []), updateLabel: vi.fn() };
  render(<Harness api={api} />);
  const country = screen.getByRole('combobox', { name: 'País' });
  await waitFor(() => expect(api.list).toHaveBeenCalledWith('countries', undefined, expect.anything()));
  await user.click(country); await user.click(await screen.findByRole('option', { name: 'Colombia' }));
  const department = screen.getByRole('combobox', { name: 'Departamento' });
  await user.click(department); await user.click(await screen.findByRole('option', { name: /Antioquia/ }));
  const city = screen.getByRole('combobox', { name: 'Ciudad o municipio' });
  await user.click(city); await user.click(await screen.findByRole('option', { name: /Medellín/ }));
  expect(screen.getByText('{"country":"CO","department":"05","city":"05001"}')).toBeTruthy();
  await user.click(country); await user.click(await screen.findByRole('option', { name: 'Estados Unidos' }));
  expect(screen.getByText('{"country":"US","department":"","city":""}')).toBeTruthy();
  expect(api.list).toHaveBeenCalledWith('departments', 'CO', expect.anything());
  expect(api.list).toHaveBeenCalledWith('municipalities', '05', expect.anything());
});

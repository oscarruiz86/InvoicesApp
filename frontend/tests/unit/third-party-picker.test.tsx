import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ThirdPartyPicker } from '@/modules/third-party-management/presentation/third-party-picker';

it('shows only the scoped results and lets a keyboard user select one', async () => {
  const user = userEvent.setup();
  const search = vi.fn(async () => [{ id: 'a'.repeat(24), name: 'Tercero activo' }]);
  const onChoose = vi.fn();
  render(<ThirdPartyPicker open companyId={'b'.repeat(24)} search={search} onChoose={onChoose} onClose={vi.fn()} />);

  const option = await screen.findByRole('button', { name: 'Tercero activo' });
  expect(search).toHaveBeenCalledWith('b'.repeat(24), '', expect.any(AbortSignal));
  await user.click(screen.getByRole('textbox', { name: 'Buscar tercero' }));
  await user.tab();
  expect(option).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(onChoose).toHaveBeenCalledWith({ id: 'a'.repeat(24), name: 'Tercero activo' });
});

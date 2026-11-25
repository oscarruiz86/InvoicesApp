import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { RouteHeadingFocus } from '@/shared/components/route-heading-focus';

afterEach(cleanup);

describe('route heading focus', () => {
  it('moves focus to the destination heading after navigation', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/first']}><RouteHeadingFocus /><Routes>
      <Route path="/first" element={<><h1>Primera página</h1><Link to="/second">Siguiente</Link></>} />
      <Route path="/second" element={<h1>Segunda página</h1>} />
    </Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Primera página' })).toHaveFocus());
    await user.click(screen.getByRole('link', { name: 'Siguiente' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Segunda página' })).toHaveFocus());
  });
});

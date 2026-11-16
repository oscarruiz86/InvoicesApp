import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { HomePage } from '@/modules/home/presentation/home-page';
import { createHealthStore } from '@/modules/home/presentation/health-store';
import { createReadHealth } from '@/modules/home/application/read-health';
import { ApplicationError } from '@/shared/application/application-error';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { theme } from '@/shared/theme/theme';

describe('home presentation and application state', () => {
  it('coordinates a substitutable port without HTTP', async () => {
    const read = vi.fn().mockResolvedValue({ status: 'ok' });
    const store = createHealthStore(createReadHealth({ read }));
    await store.getState().check();
    expect(store.getState().status).toBe('success');
    expect(read).toHaveBeenCalledOnce();
  });
  it('renders loading and success with the global theme', async () => {
    let resolve!: (value: { status: 'ok' }) => void;
    const read = () => new Promise<{ status: 'ok' }>(done => { resolve = done; });
    render(<ThemeProvider theme={theme}><HomePage store={createHealthStore(read)} /></ThemeProvider>);
    expect(screen.getByLabelText('Consultando API')).toBeInTheDocument();
    resolve({ status: 'ok' });
    expect(await screen.findByText('API disponible')).toBeInTheDocument();
  });
  it('renders a central error and recovers on explicit retry', async () => {
    const read = vi.fn().mockRejectedValueOnce(new ApplicationError('NETWORK')).mockResolvedValue({ status: 'ok' });
    render(<HomePage store={createHealthStore(read)} />);
    expect(await screen.findByText(/No se pudo establecer conexión/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar conexión' }));
    expect(await screen.findByText('API disponible')).toBeInTheDocument();
  });
  it('ignores obsolete results after cancellation', async () => {
    let complete!: (value: { status: 'ok' }) => void;
    const store = createHealthStore(() => new Promise(resolve => { complete = resolve; }));
    const operation = store.getState().check(); store.getState().cancel();
    complete({ status: 'ok' }); await operation;
    expect(store.getState().status).toBe('idle');
  });
  it('shows a controlled render fallback', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Broken(): never { throw new Error('private'); }
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    await waitFor(() => expect(screen.getByText('No fue posible mostrar esta pantalla.')).toBeInTheDocument());
    log.mockRestore();
  });
});

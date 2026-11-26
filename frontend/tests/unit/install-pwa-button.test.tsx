import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallPwaButton } from '@/shared/components/install-pwa-button';

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 Chrome/130.0.0.0' });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('PWA installation button', () => {
  it('uses the browser install prompt when available', async () => {
    const prompt = vi.fn(async () => {}), userChoice = Promise.resolve({ outcome: 'accepted' as const, platform: 'web' });
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: typeof prompt; userChoice: typeof userChoice };
    event.prompt = prompt; event.userChoice = userChoice;
    window.dispatchEvent(event);
    render(<InstallPwaButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Instalar aplicación' }));
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    expect(event.defaultPrevented).toBe(true);
  });

  it('shows platform installation steps when the browser provides no prompt', async () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
    render(<InstallPwaButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Instalar aplicación' }));
    expect(await screen.findByText(/menú Compartir de Safari/)).toBeTruthy();
  });

  it('does not show an install button when the browser has no install option', () => {
    render(<InstallPwaButton />);
    expect(screen.queryByRole('button', { name: 'Instalar aplicación' })).toBeNull();
  });
});

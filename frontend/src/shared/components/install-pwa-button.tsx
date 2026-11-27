import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let installPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    listeners.forEach(listener => listener());
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    listeners.forEach(listener => listener());
  });
}

export function InstallPwaButton() {
  const [available, setAvailable] = useState(Boolean(installPrompt));
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [supportsManualInstall] = useState(() => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  useEffect(() => {
    const update = () => setAvailable(Boolean(installPrompt));
    listeners.add(update);
    const standalone = window.matchMedia?.('(display-mode: standalone)');
    const checkInstalled = () => setInstalled(Boolean(standalone?.matches) || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)));
    checkInstalled();
    standalone?.addEventListener('change', checkInstalled);
    return () => { listeners.delete(update); standalone?.removeEventListener('change', checkInstalled); };
  }, []);

  async function install() {
    const prompt = installPrompt;
    if (!prompt) { setHelp(true); return; }
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } finally {
      installPrompt = null;
      listeners.forEach(listener => listener());
    }
  }

  if (installed || (!available && !supportsManualInstall)) return null;
  return <>
    <Button variant={available ? 'contained' : 'outlined'} onClick={() => void install()}>
      Instalar aplicación
    </Button>
    <Dialog open={help} onClose={() => setHelp(false)} aria-labelledby="install-pwa-title">
      <DialogTitle id="install-pwa-title">Instalar Invoices App</DialogTitle>
      <DialogContent>
        <Typography>En iPhone o iPad, abre el menú Compartir de Safari y selecciona «Añadir a pantalla de inicio». En Chrome, abre el menú del navegador y selecciona «Instalar aplicación» o «Añadir a pantalla principal».</Typography>
      </DialogContent>
      <DialogActions><Button onClick={() => setHelp(false)}>Entendido</Button></DialogActions>
    </Dialog>
  </>;
}

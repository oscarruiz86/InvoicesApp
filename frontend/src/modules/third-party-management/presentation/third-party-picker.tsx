import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, TextField, Typography } from '@mui/material';

export interface ThirdPartyOption { readonly id: string; readonly name: string }
export function ThirdPartyPicker({ open, companyId, search, onChoose, onClose }: {
  open: boolean; companyId: string; search(companyId: string, query: string, signal: AbortSignal): Promise<readonly ThirdPartyOption[]>;
  onChoose(value: ThirdPartyOption): void; onClose(): void;
}) {
  const [query, setQuery] = useState(''); const [items, setItems] = useState<readonly ThirdPartyOption[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setQuery(''); setItems([]); setError(null); } }, [open, companyId]);
  useEffect(() => {
    if (!open || !companyId) { setItems([]); setBusy(false); return; }
    const controller = new AbortController(); setBusy(true); setError(null);
    const timer = window.setTimeout(() => {
      void search(companyId, query.trim(), controller.signal).then(value => { if (!controller.signal.aborted) setItems(value); })
        .catch(() => { if (!controller.signal.aborted) { setItems([]); setError('No fue posible consultar terceros asociados.'); } })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [companyId, open, query, search]);
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { height: { xs: 'calc(100% - 32px)', sm: '520px' }, maxHeight: 'calc(100% - 32px)', display: 'flex', flexDirection: 'column' } } }}>
    <DialogTitle>Seleccionar tercero</DialogTitle><DialogContent sx={{ minHeight: 0, overflowY: 'auto' }}><Stack spacing={1.5} sx={{ pt: 1 }}>
      <TextField autoFocus label="Buscar tercero" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nombre" />
      {busy && <LinearProgress aria-label="Buscando terceros" />}{error && <Alert severity="error">{error}</Alert>}
      {items.map(item => <Button key={item.id} variant="outlined" disabled={busy} sx={{ justifyContent: 'flex-start', textAlign: 'left', overflowWrap: 'anywhere', minHeight: 48 }} onClick={() => onChoose(item)}>{item.name}</Button>)}
      {!busy && !error && !items.length && <Alert severity="info">No encontramos terceros para esta empresa.</Alert>}
      <Typography variant="caption" color="text.secondary">Solo aparecen terceros activos vinculados a la empresa seleccionada.</Typography>
    </Stack></DialogContent><DialogActions><Button onClick={onClose}>Cancelar</Button></DialogActions>
  </Dialog>;
}

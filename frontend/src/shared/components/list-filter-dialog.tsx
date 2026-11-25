import { useId, type ReactNode } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';

export function ListFilterDialog({ open, title, children, onClose, onApply, busy = false, applyLabel = 'Aplicar filtros', maxWidth = 'sm', leadingAction }: {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly onApply: () => void;
  readonly busy?: boolean;
  readonly applyLabel?: string;
  readonly maxWidth?: 'sm' | 'md';
  readonly leadingAction?: ReactNode;
}) {
  const titleId = useId();
  return <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth={maxWidth} aria-labelledby={titleId}
    slotProps={{ paper: { sx: { maxHeight: 'calc(100dvh - 32px)', borderRadius: 2 } } }}>
    <DialogTitle id={titleId}>{title}</DialogTitle>
    <DialogContent dividers sx={{ overflowY: 'auto' }}>{children}</DialogContent>
    <DialogActions sx={{ px: 2.5, py: 2, flexWrap: 'wrap' }}>
      {leadingAction}
      <Button onClick={onClose} disabled={busy}>Cancelar</Button>
      <Button variant="contained" onClick={onApply} disabled={busy}>{applyLabel}</Button>
    </DialogActions>
  </Dialog>;
}

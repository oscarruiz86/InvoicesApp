import { useId, type ReactNode } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';

export function FormDialog({ open, title, children, actions, onClose, maxWidth = 'md', busy = false }: {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly actions: ReactNode;
  readonly onClose: () => void;
  readonly maxWidth?: 'sm' | 'md' | 'lg';
  readonly busy?: boolean;
}) {
  const titleId = useId();
  return <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth={maxWidth} aria-labelledby={titleId}
    slotProps={{ paper: { sx: { maxHeight: 'calc(100dvh - 32px)', borderRadius: 2 } } }}>
    <DialogTitle id={titleId}>{title}</DialogTitle>
    <DialogContent dividers sx={{ overflowY: 'auto' }}>{children}</DialogContent>
    <DialogActions sx={{ px: 2.5, py: 2, flexWrap: 'wrap' }}>{actions}</DialogActions>
  </Dialog>;
}

import type { ReactNode } from 'react';
import { Alert, AlertTitle, Box } from '@mui/material';

export function ListFeedback({ kind, title, children, action }: {
  readonly kind: 'loading' | 'error' | 'empty';
  readonly title: string;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
}) {
  const severity = kind === 'error' ? 'error' : 'info';
  return <Alert severity={severity} role={kind === 'loading' ? 'status' : undefined} aria-live={kind === 'loading' ? 'polite' : 'off'}
    action={action} sx={{ alignItems: 'center', minWidth: 0, '& .MuiAlert-message': { minWidth: 0, overflowWrap: 'anywhere' } }}>
    <AlertTitle>{title}</AlertTitle>
    {children && <Box component="span">{children}</Box>}
  </Alert>;
}

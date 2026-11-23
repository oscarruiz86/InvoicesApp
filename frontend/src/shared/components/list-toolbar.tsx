import type { ReactNode } from 'react';
import { Box, Stack } from '@mui/material';

/** Right-aligned list actions. The optional sort control is reserved for compact layouts. */
export function ListToolbar({ children, mobileSortAction }: { readonly children?: ReactNode; readonly mobileSortAction?: ReactNode }) {
  return <Stack component="section" aria-label="Acciones del listado" direction="row" spacing={1} useFlexGap sx={{
    width: '100%', minWidth: 0, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap',
  }}>
    {children}
    {mobileSortAction && <Box sx={{ display: { xs: 'flex', md: 'none' } }}>{mobileSortAction}</Box>}
  </Stack>;
}

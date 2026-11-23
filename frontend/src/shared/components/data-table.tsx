import type { ReactNode } from 'react';
import { IconButton, Paper, Stack, TableContainer, TableSortLabel, Tooltip } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { ListToolbar } from './list-toolbar';

export function DataTable({ children, toolbar, mobileSortAction, pagination, loading = false }: {
  readonly children: ReactNode;
  readonly toolbar?: ReactNode;
  readonly mobileSortAction?: ReactNode;
  readonly pagination?: ReactNode;
  readonly loading?: boolean;
}) {
  return <Stack spacing={1.25} aria-busy={loading} sx={{ minWidth: 0 }}>
    {(toolbar || mobileSortAction) && <ListToolbar mobileSortAction={mobileSortAction}>{toolbar}</ListToolbar>}
    {children}
    {pagination}
  </Stack>;
}

export function DataTableSurface({ children, loading = false, sx }: {
  readonly children: ReactNode;
  readonly loading?: boolean;
  readonly sx?: SxProps<Theme>;
}) {
  return <TableContainer component={Paper} variant="outlined" aria-busy={loading} sx={[{
    width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden',
    '& table': { maxWidth: '100%' },
  }, ...(Array.isArray(sx) ? sx : [sx])]}>{children}</TableContainer>;
}

export function DataTableAction({ label, onClick, children, disabled = false, primary = false }: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly primary?: boolean;
}) {
  return <Tooltip title={label}>
    <span>
      <IconButton aria-label={label} title={label} onClick={onClick} disabled={disabled} size="small" sx={{
        width: 40, height: 40, border: '1px solid', borderColor: primary ? '#1749aa' : '#64748b', borderRadius: 2,
        bgcolor: primary ? '#1749aa' : '#ffffff', color: primary ? '#ffffff' : '#1749aa',
        '&:hover': { bgcolor: primary ? '#123780' : '#e8effe' },
        '&.Mui-focusVisible': { outline: '3px solid #1d4ed8', outlineOffset: 2 },
      }}>{children}</IconButton>
    </span>
  </Tooltip>;
}

export function DataTableSortHeader({ children, active, direction, onClick }: {
  readonly children: ReactNode;
  readonly active: boolean;
  readonly direction: 'asc' | 'desc';
  readonly onClick: () => void;
}) {
  return <TableSortLabel active={active} direction={direction} onClick={onClick}>{children}</TableSortLabel>;
}

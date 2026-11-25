import { useId } from 'react';
import { FormControl, IconButton, InputLabel, MenuItem, Pagination, Select, Stack, SvgIcon, Typography } from '@mui/material';

const defaultPageSizes = [5, 10, 20, 50, 100];

export function DataPagination({ page, pageSize, total, onPageChange, onPageSizeChange, label = 'Paginación de registros', pageSizeOptions = defaultPageSizes, disabled = false, onRefresh, refreshLabel = 'Actualizar listado', refreshDisabled = false, compact = false }: {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
  readonly label?: string;
  readonly pageSizeOptions?: readonly number[];
  readonly disabled?: boolean;
  readonly onRefresh?: () => void;
  readonly refreshLabel?: string;
  readonly refreshDisabled?: boolean;
  readonly compact?: boolean;
}) {
  const id = useId();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.75, sm: 1.25 }} useFlexGap sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', flexWrap: 'wrap', mt: 2, py: 0.5 }}>
    <Stack direction="row" spacing={0.5} sx={{ minWidth: 0, maxWidth: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
    <Pagination count={pageCount} page={Math.min(page, pageCount)} boundaryCount={1} siblingCount={1} showFirstButton showLastButton disabled={disabled}
      onChange={(_event, nextPage) => onPageChange(nextPage)} aria-label={label}
      sx={{
        '& .MuiPaginationItem-root': { boxSizing: 'border-box', minWidth: compact ? 30 : { xs: 32, sm: 36 }, height: compact ? 30 : { xs: 32, sm: 36 }, px: compact ? 0.25 : { xs: 0.25, sm: 0.5 }, mx: 0.125, border: '1px solid #64748b', borderRadius: '8px', bgcolor: '#ffffff', color: '#17233a', fontSize: compact ? 12 : { xs: 13, sm: 14 }, lineHeight: 1, '& .MuiSvgIcon-root': { fontSize: compact ? 16 : { xs: 18, sm: 20 } },
          '&:hover': { bgcolor: '#e8effe' }, '&.Mui-selected, &[aria-current="page"]': { bgcolor: '#e8effe', color: '#153d8e', fontWeight: 700 },
          '&.Mui-selected:hover, &[aria-current="page"]:hover': { bgcolor: '#e8effe' }, '&.Mui-focusVisible': { outline: '3px solid #1d4ed8', outlineOffset: 2 },
          '&.Mui-disabled': { color: '#94a3b8', borderColor: '#cbd5e1', bgcolor: '#ffffff' } },
        '& .MuiPagination-ul': { flexWrap: 'wrap', gap: 0.25 },
        '& .MuiPaginationItem-ellipsis': { minWidth: 24, border: 0, bgcolor: 'transparent' },
      }}
      getItemAriaLabel={(type, itemPage, selected) => {
        if (type === 'first') return 'Ir a la primera página';
        if (type === 'last') return 'Ir a la última página';
        if (type === 'next') return 'Ir a la página siguiente';
        if (type === 'previous') return 'Ir a la página anterior';
        return selected ? `Página ${itemPage}, actual` : `Ir a la página ${itemPage}`;
      }} />
    {onRefresh && <IconButton aria-label={refreshLabel} title={refreshLabel} onClick={onRefresh} disabled={disabled || refreshDisabled} sx={{ width: compact ? 30 : { xs: 32, sm: 36 }, height: compact ? 30 : { xs: 32, sm: 36 }, flexShrink: 0, border: '1px solid #64748b', borderRadius: '8px', color: '#17233a', '&:hover': { bgcolor: '#e8effe' } }}>
      <SvgIcon fontSize="small" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.93 9h-2.02A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z" /></SvgIcon>
    </IconButton>}
    </Stack>
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ minWidth: 0, flexWrap: 'wrap', alignItems: 'center', justifyContent: { xs: 'space-between', sm: 'flex-start' } }}>
      <Typography aria-live="polite" sx={{ color: '#475569', fontSize: compact ? 12 : { xs: 12, sm: 13 }, whiteSpace: { xs: 'normal', sm: 'nowrap' } }}>Registros {start}–{end} de {total}</Typography>
      <FormControl size="small" sx={{ minWidth: compact ? 112 : { xs: 120, sm: 136 }, '& .MuiOutlinedInput-root': { height: compact ? 32 : { xs: 32, sm: 36 }, minHeight: compact ? 32 : { xs: 32, sm: 36 }, borderRadius: '8px', bgcolor: '#ffffff', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#64748b' }, '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#475569' }, '&.Mui-focused': { outline: 'none', boxShadow: '0 0 0 3px rgba(29,78,216,0.12)', bgcolor: '#f8fbff' }, '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1, borderColor: 'transparent' }, '&.Mui-error.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a23b16' } }, '& .MuiSelect-select': { py: 0, pl: compact ? 0.75 : 1, pr: compact ? 3 : 3.5, minHeight: 'unset', display: 'flex', alignItems: 'center', color: '#17233a', fontSize: compact ? 12 : 13 }, '& .MuiSelect-icon': { color: '#17233a' } }}>
        <InputLabel id={`${id}-page-size-label`} sx={{ color: '#475569', fontSize: compact ? 11 : 12 }}>Registros por página</InputLabel>
        <Select labelId={`${id}-page-size-label`} id={`${id}-page-size`} value={pageSize} label="Registros por página" disabled={disabled}
          onChange={event => onPageSizeChange(Number(event.target.value))}>
          {pageSizeOptions.map(size => <MenuItem key={size} value={size}>{size}</MenuItem>)}
        </Select>
      </FormControl>
    </Stack>
  </Stack>;
}

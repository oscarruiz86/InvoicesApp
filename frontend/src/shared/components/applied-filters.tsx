import { Chip, Stack, SvgIcon, Typography } from '@mui/material';

export interface AppliedFilter { readonly key: string; readonly label: string }

export function AppliedFilters({ filters, onRemove, onClear }: {
  readonly filters: readonly AppliedFilter[];
  readonly onRemove: (key: string) => void;
  readonly onClear?: () => void;
}) {
  return <Stack component="div" aria-label="Filtros aplicados" direction="row" spacing={0.75} useFlexGap sx={{
    minWidth: 0, alignItems: 'center', flexWrap: 'wrap', color: 'text.secondary', fontSize: 13,
  }}>
    <Typography component="span" sx={{ color: '#475569', fontSize: 13, fontWeight: 700 }}>Filtros aplicados:</Typography>
    {filters.length ? filters.map(filter => <Chip key={filter.key} size="small" label={filter.label}
      onDelete={() => onRemove(filter.key)} deleteIcon={<SvgIcon fontSize="small" aria-hidden="true"><path d="m19 6.4-1.4-1.4-5.6 5.6-5.6-5.6L5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4Z" /></SvgIcon>}
      sx={{ maxWidth: '100%', bgcolor: '#eef4ff', color: '#153d8e', border: '1px solid #bfcee7', fontWeight: 650,
        '& .MuiChip-label': { overflowWrap: 'anywhere' }, '& .MuiChip-deleteIcon': { color: 'inherit' } }} />) : <Typography component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>Ninguno</Typography>}
    {filters.length > 1 && onClear && <Chip size="small" variant="outlined" label="Limpiar filtros" onClick={onClear} />}
  </Stack>;
}

import { useId, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Radio, RadioGroup, Select, Stack, SvgIcon, Typography } from '@mui/material';

export interface SortField { readonly key: string; readonly label: string }

export function MobileSortControl({ fields, sortBy, direction, onChange, label = 'Ordenar registros' }: {
  readonly fields: readonly SortField[];
  readonly sortBy: string;
  readonly direction: 'asc' | 'desc';
  readonly onChange: (sortBy: string, direction: 'asc' | 'desc') => void;
  readonly label?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draftField, setDraftField] = useState(sortBy);
  const [draftDirection, setDraftDirection] = useState<'asc' | 'desc'>(direction);
  const show = () => { setDraftField(sortBy); setDraftDirection(direction); setOpen(true); };
  const apply = () => { onChange(draftField, draftDirection); setOpen(false); };

  return <>
    <IconButton aria-label={label} title={label} onClick={show} sx={{ width: 42, height: 42, border: '1px solid', borderColor: 'divider', borderRadius: 2, color: 'text.primary' }}>
      <SvgIcon fontSize="small" aria-hidden="true"><path d="M3 7h13v2H3V7Zm0 4h9v2H3v-2Zm0 4h5v2H3v-2Zm15.5-1.5 3.5 4h-7l3.5-4ZM17 4h3v8h-3V4Z" /></SvgIcon>
    </IconButton>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs" aria-labelledby={`${id}-title`}>
      <DialogTitle id={`${id}-title`}>Ordenar registros</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <FormControl fullWidth size="small">
            <InputLabel id={`${id}-field-label`}>Ordenar por</InputLabel>
            <Select id={`${id}-field`} labelId={`${id}-field-label`} label="Ordenar por" value={draftField} onChange={event => setDraftField(String(event.target.value))}>
              {fields.map(field => <MenuItem key={field.key} value={field.key}>{field.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl>
            <Typography component="span" variant="body2" sx={{ fontWeight: 700 }}>Dirección</Typography>
            <RadioGroup row value={draftDirection} onChange={event => setDraftDirection(event.target.value as 'asc' | 'desc')}>
              <FormControlLabel value="asc" control={<Radio />} label="Ascendente" />
              <FormControlLabel value="desc" control={<Radio />} label="Descendente" />
            </RadioGroup>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 2 }}>
        <Button onClick={() => setOpen(false)}>Cancelar</Button>
        <Button variant="contained" onClick={apply}>Aplicar orden</Button>
      </DialogActions>
    </Dialog>
  </>;
}

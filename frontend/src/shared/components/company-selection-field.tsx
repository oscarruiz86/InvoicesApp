import { Button, Stack, Typography } from '@mui/material';

/** Consistent entry point for selecting a company; list loading and permissions stay with the owning page. */
export function CompanySelectionField({ label = 'Empresa', value, placeholder = 'Todas las empresas', onClick, disabled = false }: {
  label?: string; value?: string; placeholder?: string; onClick: () => void; disabled?: boolean;
}) {
  return <Button type="button" variant="outlined" onClick={onClick} disabled={disabled} aria-haspopup="dialog"
    sx={{ width: '100%', justifyContent: 'space-between', textAlign: 'left', minHeight: 48, minWidth: 0 }}>
    <Stack sx={{ alignItems: 'flex-start', minWidth: 0 }}><Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" noWrap>{value || placeholder}</Typography></Stack><span aria-hidden="true">▾</span>
  </Button>;
}

import { useEffect, useState } from 'react';
import { Alert, MenuItem, Stack, TextField } from '@mui/material';
import type { CatalogApi, CatalogOption } from '../application/catalog-api';

export interface GeographyValue { readonly country: string; readonly department: string; readonly city: string }

export function GeographyFields({ api, value, disabled = false, emptyLabel = 'Sin seleccionar', onChange }: {
  api: CatalogApi; value: GeographyValue; disabled?: boolean; emptyLabel?: string; onChange(value: GeographyValue): void;
}) {
  const [countries, setCountries] = useState<readonly CatalogOption[]>([]);
  const [departments, setDepartments] = useState<readonly CatalogOption[]>([]);
  const [municipalities, setMunicipalities] = useState<readonly CatalogOption[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState({ countries: false, departments: false, municipalities: false });
  useEffect(() => { const controller = new AbortController(); setLoading(previous => ({ ...previous, countries: true })); void api.list('countries', undefined, controller.signal).then(setCountries).catch(() => { if (!controller.signal.aborted) { setCountries([]); setError(true); } }).finally(() => { if (!controller.signal.aborted) setLoading(previous => ({ ...previous, countries: false })); }); return () => controller.abort(); }, [api]);
  useEffect(() => { const controller = new AbortController(); setDepartments([]); setMunicipalities([]);
    if (value.country) { setLoading(previous => ({ ...previous, departments: true })); void api.list('departments', value.country, controller.signal).then(setDepartments).catch(() => { if (!controller.signal.aborted) { setDepartments([]); setError(true); } }).finally(() => { if (!controller.signal.aborted) setLoading(previous => ({ ...previous, departments: false })); }); }
    return () => controller.abort();
  }, [api, value.country]);
  useEffect(() => { const controller = new AbortController(); setMunicipalities([]);
    if (value.department) { setLoading(previous => ({ ...previous, municipalities: true })); void api.list('municipalities', value.department, controller.signal).then(setMunicipalities).catch(() => { if (!controller.signal.aborted) { setMunicipalities([]); setError(true); } }).finally(() => { if (!controller.signal.aborted) setLoading(previous => ({ ...previous, municipalities: false })); }); }
    return () => controller.abort();
  }, [api, value.department]);
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    {error && <Alert severity="error" onClose={() => setError(false)}>No fue posible cargar las opciones geográficas. Vuelve a abrir el formulario para reintentar.</Alert>}
    <TextField select fullWidth label="País" value={value.country} disabled={disabled || loading.countries} helperText={loading.countries ? 'Cargando países…' : undefined} onChange={event => onChange({ country: event.target.value, department: '', city: '' })}>
      <MenuItem value="">{emptyLabel}</MenuItem>{countries.map(item => <MenuItem key={item.code} value={item.code}>{item.label}</MenuItem>)}
    </TextField>
    <TextField select fullWidth label="Departamento" value={value.department} disabled={disabled || !value.country || loading.departments} helperText={loading.departments ? 'Cargando departamentos…' : undefined} onChange={event => onChange({ ...value, department: event.target.value, city: '' })}>
      <MenuItem value="">{emptyLabel}</MenuItem>{departments.map(item => <MenuItem key={item.code} value={item.code}>{item.label}</MenuItem>)}
    </TextField>
    <TextField select fullWidth label="Ciudad o municipio" value={value.city} disabled={disabled || !value.department || loading.municipalities} helperText={loading.municipalities ? 'Cargando municipios…' : undefined} onChange={event => onChange({ ...value, city: event.target.value })}>
      <MenuItem value="">{emptyLabel}</MenuItem>{municipalities.map(item => <MenuItem key={item.code} value={item.code}>{item.label}{item.territoryType !== 'Municipio' ? ` · ${item.territoryType}` : ''}</MenuItem>)}
    </TextField>
  </Stack>;
}

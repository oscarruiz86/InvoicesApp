import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Skeleton, Stack, TextField, Typography } from '@mui/material';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { CompanyApi } from '@/modules/company-management/application/company-api';
import type { CompanyRecord } from '@/modules/company-management/domain/company';
import { DataPagination } from './data-pagination';

export function CompanyPickerDialog({ open, api, scope, onChoose, onClose }: {
  open: boolean; api: CompanyApi; scope: PermissionScope; onChoose: (record: CompanyRecord) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState(''); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(5);
  const [result, setResult] = useState<Awaited<ReturnType<CompanyApi['list']>> | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) { setQuery(''); setPage(1); setResult(null); setError(null); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setLoading(true); setError(null);
    void api.list(scope, { page: String(page), pageSize: String(pageSize), sort: 'businessName', direction: 'asc', ...(query.trim() ? { q: query.trim() } : {}) }, controller.signal)
      .then(value => { if (!controller.signal.aborted) setResult(value); })
      .catch(() => { if (!controller.signal.aborted) setError('No fue posible consultar empresas.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, open, page, pageSize, query, scope]);
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { height: { xs: 'calc(100% - 32px)', sm: '640px' }, maxHeight: 'calc(100% - 32px)', display: 'flex', flexDirection: 'column' } } }}>
    <DialogTitle>Seleccionar empresa</DialogTitle><DialogContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}><Stack spacing={2} sx={{ pt: 1, minHeight: 0, flex: 1 }}>
      <TextField autoFocus label="Buscar empresa" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Nombre o NIT" />
      {loading && <LinearProgress aria-label="Cargando empresas" sx={{ borderRadius: 1 }} />}{error && <Alert severity="error">{error}</Alert>}
      <Stack spacing={1} aria-busy={loading} sx={{ minHeight: 0, flex: 1, overflowY: 'auto', pr: 0.5, opacity: loading || error ? 0.55 : 1, transition: 'opacity 180ms ease' }}>
        {loading && !result ? Array.from({ length: 5 }, (_value, index) => <Skeleton key={index} variant="rounded" height={62} />) : result?.items.map(record => <Button key={record.company.id} disabled={Boolean(error)} variant="outlined" sx={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 62 }} onClick={() => onChoose(record)}><Stack sx={{ alignItems: 'flex-start' }}><span>{record.company.businessName ?? record.company.tradeName ?? record.company.id}</span><Typography variant="caption">NIT {record.company.documentNumber}</Typography></Stack></Button>)}
        {result && !result.items.length && !loading && <Alert severity="info">No encontramos empresas con esa búsqueda.</Alert>}
      </Stack>
      {result && <DataPagination page={page} pageSize={result.pageSize} total={result.total} disabled={loading} label="Páginas de empresas" onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} compact />}
    </Stack></DialogContent><DialogActions><Button onClick={onClose}>Cancelar</Button></DialogActions>
  </Dialog>;
}

import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from '@/shared/theme/theme';
import type { AuditHistoryEvent, AuditHistoryReadPort } from '@/modules/audit/application/audit-history-api';
import { AuditHistoryPage } from '@/modules/audit/presentation/audit-history-page';

const events: AuditHistoryEvent[] = [{ eventId:'event_01',occurredAt:'2026-11-25T15:30:00.000Z',source:'fleet',actor:{kind:'user',subject:'admin_01',displayName:'Ana Gómez'},action:'VEHICLE_UPDATED',result:'allowed',reason:'BUSINESS_MUTATION',correlationId:'corr_01',scope:{companyId:null,thirdPartyId:'third_party_01'},resource:{type:'vehicle',id:'vehicle_01'},beforeVersion:'1',afterVersion:'2' }];
const api: AuditHistoryReadPort = { list: async () => ({items:events,nextCursor:null,pageSize:20}), get: async () => events[0] };
createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline /><AuditHistoryPage api={api} /></ThemeProvider>);

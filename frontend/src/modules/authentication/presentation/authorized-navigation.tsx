import { useStore } from 'zustand';
import { Button } from '@mui/material';
import { Link, useLocation } from 'react-router';
import type { Permission } from '../domain/permissions';
import type { AuthorizationStore } from './authorization-store';
export interface NavigationItem { readonly label: string; readonly path: string; readonly permission?: Permission; readonly anyPermission?: readonly Permission[]; readonly context?: 'active' | 'organization' }
export function AuthorizedNavigation({ store, items, contextKind }: { store: AuthorizationStore; items: readonly NavigationItem[]; contextKind?: 'GLOBAL' | 'ORGANIZATION' }) {
  useStore(store);
  const { pathname } = useLocation();
  return <>{items.filter(item => (!item.permission || store.getState().has(item.permission))
    && (!item.anyPermission || item.anyPermission.some(permission => store.getState().has(permission)))
    && (item.context !== 'organization' || contextKind === 'ORGANIZATION')).map(item => {
      const current = pathname === item.path || (item.path !== '/' && pathname.startsWith(`${item.path}/`));
      return <Button variant="text" key={item.path} component={Link} to={item.path} aria-current={current ? 'page' : undefined}
        sx={{ justifyContent: 'flex-start', px: 1.5, minHeight: 42, borderColor: 'transparent', bgcolor: current ? '#e8effe' : 'transparent', color: current ? '#153d8e' : 'text.primary', fontWeight: current ? 700 : 400, '&:hover': { bgcolor: '#e8effe' } }}>{item.label}</Button>;
    })}</>;
}

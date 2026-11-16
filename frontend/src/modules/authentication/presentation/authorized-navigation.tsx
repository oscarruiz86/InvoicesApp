import { useStore } from 'zustand';
import { Button } from '@mui/material';
import { Link } from 'react-router';
import type { Permission } from '../domain/permissions';
import type { AuthorizationStore } from './authorization-store';
export interface NavigationItem { readonly label: string; readonly path: string; readonly permission?: Permission; readonly anyPermission?: readonly Permission[] }
export function AuthorizedNavigation({ store, items }: { store: AuthorizationStore; items: readonly NavigationItem[] }) {
  useStore(store);
  return <>{items.filter(item => (!item.permission || store.getState().has(item.permission))
    && (!item.anyPermission || item.anyPermission.some(permission => store.getState().has(permission)))).map(item => <Button key={item.path} component={Link} to={item.path}>{item.label}</Button>)}</>;
}

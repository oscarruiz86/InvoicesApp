import { useStore } from 'zustand';
import { Button, Stack, Typography } from '@mui/material';
import { Link, useLocation } from 'react-router';
import type { Permission } from '../domain/permissions';
import type { AuthorizationStore } from './authorization-store';

export interface NavigationItem {
  readonly label: string;
  readonly path: string;
  readonly group?: string;
  readonly permission?: Permission;
  readonly anyPermission?: readonly Permission[];
  readonly context?: 'active' | 'organization' | 'global';
}

export function AuthorizedNavigation({ store, items, contextKind }: { store: AuthorizationStore; items: readonly NavigationItem[]; contextKind?: 'GLOBAL' | 'ORGANIZATION' }) {
  useStore(store);
  const { pathname } = useLocation();
  const visibleItems = items.filter(item => (!item.permission || store.getState().has(item.permission))
    && (!item.anyPermission || item.anyPermission.some(permission => store.getState().has(permission)))
    && (item.context !== 'organization' || contextKind === 'ORGANIZATION')
    && (item.context !== 'global' || contextKind === 'GLOBAL'));
  const groups = new Map<string, NavigationItem[]>();

  for (const item of visibleItems) {
    const group = item.group ?? 'Administración';
    const groupItems = groups.get(group) ?? [];
    groupItems.push(item);
    groups.set(group, groupItems);
  }

  return <>{Array.from(groups, ([group, groupItems]) => <Stack key={group} spacing={.5} sx={{ mt: 1 }}>
    <Typography variant="overline" sx={{ px: 1.5, fontWeight: 700 }}>{group}</Typography>
    {groupItems.map(item => {
      const current = pathname === item.path || (item.path !== '/' && pathname.startsWith(`${item.path}/`));
      return <Button variant="text" key={item.path} component={Link} to={item.path} aria-current={current ? 'page' : undefined}
        sx={{ justifyContent: 'flex-start', px: 1.5, minHeight: 42, borderColor: 'transparent', bgcolor: current ? '#e8effe' : 'transparent', color: current ? '#153d8e' : 'text.primary', fontWeight: current ? 700 : 400, '&:hover': { bgcolor: '#e8effe' } }}>{item.label}</Button>;
    })}
  </Stack>)}</>;
}

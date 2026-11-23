import type { ReactNode } from 'react';
import { Paper, Stack, Typography } from '@mui/material';

export function ModuleAccessCard({ title, description, action }: {
  readonly title: string;
  readonly description: string;
  readonly action: ReactNode;
}) {
  return <Paper component="article" variant="outlined" sx={{ p: 2, minWidth: 0, minHeight: 148 }}>
    <Stack spacing={1.5} sx={{ height: '100%', alignItems: 'flex-start' }}>
      <Typography component="h2" variant="h6">{title}</Typography>
      <Typography color="text.secondary" sx={{ flexGrow: 1 }}>{description}</Typography>
      {action}
    </Stack>
  </Paper>;
}

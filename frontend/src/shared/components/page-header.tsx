import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

/** Shared heading block for module pages. Keep actions beside the title on wide screens. */
export function PageHeader({ title, description, actions, tabIndex }: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly tabIndex?: number;
}) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.25, sm: 2 }} useFlexGap sx={{
    width: '100%', minWidth: 0, alignItems: { xs: 'stretch', sm: 'flex-start' },
    justifyContent: 'space-between', flexWrap: 'wrap', pb: 2, borderBottom: '1px solid', borderColor: 'divider',
  }}>
    <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
      <Typography component="h1" variant="h4" tabIndex={tabIndex} sx={{ overflowWrap: 'anywhere' }}>{title}</Typography>
      {description && <Typography color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>}
    </Box>
    {actions && <Box sx={{ flexShrink: 0 }}>{actions}</Box>}
  </Stack>;
}

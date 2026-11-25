import { Chip } from '@mui/material';

const tones = {
  success: { background: '#ecfdf3', foreground: '#166534' },
  warning: { background: '#fff5eb', foreground: '#9a3412' },
  danger: { background: '#fef2f2', foreground: '#b42318' },
  neutral: { background: '#eef2f7', foreground: '#475569' },
  info: { background: '#eef4ff', foreground: '#1749aa' },
} as const;

export function StatusChip({ label, tone }: { readonly label: string; readonly tone: keyof typeof tones }) {
  const colors = tones[tone];
  return <Chip size="small" label={label} sx={{ width: 'fit-content', maxWidth: 'none', bgcolor: colors.background, color: colors.foreground,
    fontWeight: 700, '& .MuiChip-label': { whiteSpace: 'nowrap' },
    '&::before': { content: '""', width: 7, height: 7, borderRadius: '50%', bgcolor: 'currentColor', flexShrink: 0, ml: 1 },
  }} />;
}

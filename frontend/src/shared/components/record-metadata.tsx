import { Typography } from '@mui/material';

export function RecordMetadata({ createdAt, updatedAt, formatDate }: {
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  readonly formatDate: (value: string) => string;
}) {
  const label = updatedAt ? 'Editado' : createdAt ? 'Creado' : undefined;
  const value = updatedAt || createdAt;
  if (!label || !value) return null;
  return <Typography variant="caption" color="text.secondary">{label} el {formatDate(value)}</Typography>;
}

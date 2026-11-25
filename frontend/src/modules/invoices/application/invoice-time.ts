export function normalizeInvoiceTime(value: string): string {
  const match = /^(\d{2}:\d{2})(?::(\d{2}))?$/.exec(value);
  return match ? `${match[1]}:${match[2] ?? '00'}` : value;
}

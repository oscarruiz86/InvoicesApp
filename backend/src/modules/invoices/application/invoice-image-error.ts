export class InvoiceImageError extends Error {
  constructor(readonly code: 'IMAGE_TOO_LARGE' | 'IMAGE_TYPE_UNSUPPORTED' | 'IMAGE_INVALID' | 'IMAGE_DIMENSIONS_INVALID') { super(code); }
}

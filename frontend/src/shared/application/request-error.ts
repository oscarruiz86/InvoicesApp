import { ApplicationError } from './application-error';
export class RequestError extends ApplicationError {
  constructor(readonly businessCode: string, readonly fields: readonly string[] = []) { super('HTTP'); }
}

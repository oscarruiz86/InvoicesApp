import type { AuthenticatedActor, IdentityVerifier } from '../application/identity-verifier';
import { AuthenticationError } from '../application/authentication-error';
import { errorResponse } from '@/shared/presentation/http/errors';

export function authenticatedHandler(verifier: IdentityVerifier, action: (actor: AuthenticatedActor, request: Request) => Response | Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      const authorization = request.headers.get('authorization');
      if (!authorization || authorization.length > 16_384) throw new AuthenticationError();
      const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
      if (!match) throw new AuthenticationError();
      return await action(await verifier.verify(match[1]), request);
    } catch (error) { return errorResponse(error); }
  };
}

import type { Request } from 'express';
import type { AuthenticatedIdentity } from '../index';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedIdentity;
}

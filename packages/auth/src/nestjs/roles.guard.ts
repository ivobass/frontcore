import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasRequiredRole, type AppRole } from '../roles';
import { ROLES_KEY } from './roles.decorator';
import type { AuthenticatedRequest } from './types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.getAllAndOverride<AppRole>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRole) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Utilizador não autenticado.');
    }

    if (user.isSuperAdmin) return true;

    if (!hasRequiredRole(user.role as AppRole, requiredRole)) {
      throw new ForbiddenException('Sem permissões suficientes.');
    }

    return true;
  }
}

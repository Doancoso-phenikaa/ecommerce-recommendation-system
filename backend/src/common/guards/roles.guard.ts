import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { UserRole } from '../enums/user-role.enum.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';

interface RequestWithAuthenticatedUser {
  user?: AuthenticatedUser;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(executionContext: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [executionContext.getHandler(), executionContext.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = executionContext
      .switchToHttp()
      .getRequest<RequestWithAuthenticatedUser>();

    if (!request.user) {
      return false;
    }

    return requiredRoles.includes(request.user.role);
  }
}

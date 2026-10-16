import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';

interface RequestWithAuthenticatedUser {
  user?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (
    field: keyof AuthenticatedUser | undefined,
    executionContext: ExecutionContext,
  ) => {
    const request = executionContext
      .switchToHttp()
      .getRequest<RequestWithAuthenticatedUser>();

    if (!field) {
      return request.user;
    }

    return request.user?.[field];
  },
);

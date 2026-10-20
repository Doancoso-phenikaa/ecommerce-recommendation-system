import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AdminRecommendationCatalogController } from './admin-recommendation-catalog.controller.js';

function contextFor(role: UserRole): ExecutionContext {
  return {
    getHandler: () => AdminRecommendationCatalogController.prototype.syncCatalog,
    getClass: () => AdminRecommendationCatalogController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { role } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminRecommendationCatalogController authorization', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows ADMIN to trigger catalog sync', () => {
    expect(guard.canActivate(contextFor(UserRole.ADMIN))).toBe(true);
  });

  it.each([UserRole.CUSTOMER, UserRole.SELLER])(
    'rejects non-admin role %s',
    (role) => {
      expect(guard.canActivate(contextFor(role))).toBe(false);
    },
  );
});

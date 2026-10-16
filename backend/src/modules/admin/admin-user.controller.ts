import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AdminUserService } from './admin-user.service.js';
import { AdminUserQueryDto } from './dto/admin-user-query.dto.js';
import { UserIdParamDto } from './dto/user-id-param.dto.js';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Get()
  getUsers(@Query() query: AdminUserQueryDto) {
    return this.adminUserService.getUsers(query);
  }

  @Get(':userId')
  getUserDetail(@Param() params: UserIdParamDto) {
    return this.adminUserService.getUserDetail(params.userId);
  }

  @Patch(':userId/deactivate')
  deactivateUser(
    @CurrentUser('userId') currentAdminUserId: string,
    @Param() params: UserIdParamDto,
  ) {
    return this.adminUserService.deactivateUser(
      currentAdminUserId,
      params.userId,
    );
  }

  @Patch(':userId/activate')
  activateUser(@Param() params: UserIdParamDto) {
    return this.adminUserService.activateUser(params.userId);
  }
}

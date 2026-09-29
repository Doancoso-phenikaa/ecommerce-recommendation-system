import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { DiscountService } from './discount.service.js';
import { CreateDiscountDto } from './dto/create-discount.dto.js';
import { DiscountIdParamDto } from './dto/discount-id-param.dto.js';
import { UpdateDiscountStatusDto } from './dto/update-discount-status.dto.js';
import { UpdateDiscountDto } from './dto/update-discount.dto.js';

@Controller('admin/discounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Post()
  createDiscount(@Body() createDiscountDto: CreateDiscountDto) {
    return this.discountService.createDiscount(createDiscountDto);
  }

  @Get()
  getDiscounts() {
    return this.discountService.getDiscounts();
  }

  @Patch(':discountId')
  updateDiscount(
    @Param() params: DiscountIdParamDto,
    @Body() updateDiscountDto: UpdateDiscountDto,
  ) {
    return this.discountService.updateDiscount(
      params.discountId,
      updateDiscountDto,
    );
  }

  @Patch(':discountId/status')
  updateDiscountStatus(
    @Param() params: DiscountIdParamDto,
    @Body() updateDiscountStatusDto: UpdateDiscountStatusDto,
  ) {
    return this.discountService.updateDiscountStatus(
      params.discountId,
      updateDiscountStatusDto,
    );
  }
}

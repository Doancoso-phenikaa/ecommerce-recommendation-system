import { Controller, Get, Param } from '@nestjs/common';
import { ShopIdParamDto } from '../admin/dto/shop-id-param.dto.js';
import type { PublicShopListResponse } from './interfaces/public-shop-list-response.interface.js';
import { ShopService } from './shop.service.js';

@Controller('shops')
export class PublicShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get()
  getActiveShops(): Promise<PublicShopListResponse> {
    return this.shopService.getActiveShops();
  }

  @Get(':shopId')
  getActiveShopDetail(@Param() params: ShopIdParamDto) {
    return this.shopService.getActiveShopDetail(params.shopId);
  }
}

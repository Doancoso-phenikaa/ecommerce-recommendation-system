import { Controller, Get } from '@nestjs/common';
import type { PublicShopListResponse } from './interfaces/public-shop-list-response.interface.js';
import { ShopService } from './shop.service.js';

@Controller('shops')
export class PublicShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get()
  getActiveShops(): Promise<PublicShopListResponse> {
    return this.shopService.getActiveShops();
  }
}

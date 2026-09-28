import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Seller } from '../seller/entities/seller.entity.js';
import { SellerStatus } from '../seller/enums/seller-status.enum.js';
import { CreateShopDto } from './dto/create-shop.dto.js';
import { Shop } from './entities/shop.entity.js';
import { ShopStatus } from './enums/shop-status.enum.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  code?: string;
}

@Injectable()
export class ShopService {
  constructor(
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
    @InjectRepository(Seller)
    private readonly sellerRepository: Repository<Seller>,
  ) {}

  async createShop(userId: string, createShopDto: CreateShopDto) {
    const seller = await this.sellerRepository.findOneBy({ userId });

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    if (seller.status !== SellerStatus.ACTIVE) {
      throw new ForbiddenException('Seller account is not active');
    }

    const shopExists = await this.shopRepository.existsBy({
      sellerId: seller.sellerId,
    });

    if (shopExists) {
      throw new ConflictException('Seller already has a shop');
    }

    try {
      const shop = await this.shopRepository.save(
        this.shopRepository.create({
          sellerId: seller.sellerId,
          name: createShopDto.name,
          description: createShopDto.description?.trim() || null,
          rating: '0',
          status: ShopStatus.PENDING,
        }),
      );

      return {
        shopId: shop.shopId,
        sellerId: shop.sellerId,
        name: shop.name,
        description: shop.description,
        rating: shop.rating,
        status: shop.status,
        createdAt: shop.createdAt,
        updatedAt: shop.updatedAt,
      };
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Seller already has a shop');
      }

      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as PostgresDriverError;
    return driverError.code === POSTGRES_UNIQUE_VIOLATION;
  }
}

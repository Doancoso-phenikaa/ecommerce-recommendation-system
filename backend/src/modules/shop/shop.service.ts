import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { Seller } from '../seller/entities/seller.entity.js';
import { SellerStatus } from '../seller/enums/seller-status.enum.js';
import { User } from '../user/entities/user.entity.js';
import { AdminShopQueryDto } from '../admin/dto/admin-shop-query.dto.js';
import { CreateShopDto } from './dto/create-shop.dto.js';
import { UpdateShopDto } from './dto/update-shop.dto.js';
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
    private readonly dataSource: DataSource,
  ) {}

  async getMyShop(userId: string) {
    const shop = await this.findMyShop(userId);

    return this.buildShopResponse(shop);
  }

  async updateMyShop(userId: string, updateShopDto: UpdateShopDto) {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.findAndLockMyShop(manager, userId);

      if (
        shop.status !== ShopStatus.REJECTED &&
        shop.status !== ShopStatus.ACTIVE
      ) {
        throw new ConflictException(
          'Only rejected or active shops can be updated',
        );
      }

      if (updateShopDto.name !== undefined) {
        shop.name = updateShopDto.name.trim();
      }

      if (updateShopDto.description !== undefined) {
        shop.description = updateShopDto.description.trim() || null;
      }

      const updatedShop = await manager.getRepository(Shop).save(shop);

      return this.buildShopResponse(updatedShop);
    });
  }

  async resubmitShop(userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.findAndLockMyShop(manager, userId);

      if (shop.status !== ShopStatus.REJECTED) {
        throw new ConflictException('Only rejected shops can be resubmitted');
      }

      shop.status = ShopStatus.PENDING;
      shop.rejectionReason = null;
      const resubmittedShop = await manager.getRepository(Shop).save(shop);

      return this.buildShopResponse(resubmittedShop);
    });
  }

  private async findMyShop(userId: string): Promise<Shop> {
    const seller = await this.sellerRepository.findOneBy({ userId });

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    const shop = await this.shopRepository.findOneBy({
      sellerId: seller.sellerId,
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    return shop;
  }

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

      return this.buildShopResponse(shop);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Seller already has a shop');
      }

      throw error;
    }
  }

  async getShops(query: AdminShopQueryDto) {
    const { page, limit } = query;
    const shopQuery = this.shopRepository
      .createQueryBuilder('shop')
      .innerJoinAndSelect('shop.seller', 'seller')
      .innerJoinAndSelect('seller.user', 'user')
      .select([
        'shop.shopId',
        'shop.name',
        'shop.description',
        'shop.rating',
        'shop.status',
        'shop.rejectionReason',
        'shop.createdAt',
        'shop.updatedAt',
        'seller.sellerId',
        'user.userId',
        'user.fullName',
        'user.email',
      ]);

    if (query.search) {
      shopQuery.andWhere(
        `(
          shop.name ILIKE :search
          OR user.fullName ILIKE :search
          OR user.email ILIKE :search
        )`,
        { search: `%${query.search}%` },
      );
    }

    if (query.status !== undefined) {
      shopQuery.andWhere('shop.status = :status', { status: query.status });
    }

    const [shops, totalItems] = await shopQuery
      .orderBy('shop.createdAt', 'DESC')
      .addOrderBy('shop.shopId', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: shops.map((shop) => this.buildAdminShopListResponse(shop)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async getShopDetail(shopId: string) {
    const shop = await this.shopRepository
      .createQueryBuilder('shop')
      .innerJoinAndSelect('shop.seller', 'seller')
      .innerJoinAndSelect('seller.user', 'user')
      .select([
        'shop.shopId',
        'shop.name',
        'shop.description',
        'shop.rating',
        'shop.status',
        'shop.rejectionReason',
        'shop.createdAt',
        'shop.updatedAt',
        'seller.sellerId',
        'seller.status',
        'user.userId',
        'user.fullName',
        'user.email',
        'user.phone',
        'user.isActive',
      ])
      .where('shop.shopId = :shopId', { shopId })
      .getOne();

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    return this.buildAdminShopDetailResponse(shop);
  }

  async approveShop(shopId: string) {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.findAndLockShop(manager, shopId);

      if (shop.status !== ShopStatus.PENDING) {
        throw new ConflictException('Only pending shops can be approved');
      }

      await this.revalidateShopApproval(manager, shop);

      shop.status = ShopStatus.ACTIVE;
      shop.rejectionReason = null;
      const approvedShop = await manager.getRepository(Shop).save(shop);

      return this.buildShopResponse(approvedShop);
    });
  }

  async rejectShop(shopId: string, rejectionReasonInput: string) {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.findAndLockShop(manager, shopId);

      if (shop.status !== ShopStatus.PENDING) {
        throw new ConflictException('Only pending shops can be rejected');
      }

      const rejectionReason = rejectionReasonInput.trim();

      if (!rejectionReason) {
        throw new BadRequestException('Rejection reason must not be empty');
      }

      shop.status = ShopStatus.REJECTED;
      shop.rejectionReason = rejectionReason;
      const rejectedShop = await manager.getRepository(Shop).save(shop);

      return this.buildShopResponse(rejectedShop);
    });
  }

  async suspendShop(shopId: string) {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.findAndLockShop(manager, shopId);

      if (shop.status !== ShopStatus.ACTIVE) {
        throw new ConflictException('Only active shops can be suspended');
      }

      shop.status = ShopStatus.SUSPENDED;
      const suspendedShop = await manager.getRepository(Shop).save(shop);

      return {
        shopId: suspendedShop.shopId,
        status: suspendedShop.status,
        message: 'Shop suspended successfully',
      };
    });
  }

  async activateShop(shopId: string) {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.findAndLockShop(manager, shopId);

      if (shop.status !== ShopStatus.SUSPENDED) {
        throw new ConflictException('Only suspended shops can be activated');
      }

      shop.status = ShopStatus.ACTIVE;
      const activatedShop = await manager.getRepository(Shop).save(shop);

      return {
        shopId: activatedShop.shopId,
        status: activatedShop.status,
        message: 'Shop activated successfully',
      };
    });
  }

  private async findAndLockMyShop(
    manager: EntityManager,
    userId: string,
  ): Promise<Shop> {
    const seller = await manager.getRepository(Seller).findOneBy({ userId });

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    const shopReference = await manager.getRepository(Shop).findOne({
      select: { shopId: true },
      where: { sellerId: seller.sellerId },
    });

    if (!shopReference) {
      throw new NotFoundException('Shop not found');
    }

    const shop = await this.findAndLockShop(manager, shopReference.shopId);

    if (shop.sellerId !== seller.sellerId) {
      throw new NotFoundException('Shop not found');
    }

    return shop;
  }

  private async findAndLockShop(
    manager: EntityManager,
    shopId: string,
  ): Promise<Shop> {
    const shop = await manager
      .getRepository(Shop)
      .createQueryBuilder('shop')
      .setLock('pessimistic_write')
      .where('shop.shopId = :shopId', { shopId })
      .getOne();

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    return shop;
  }

  private async revalidateShopApproval(
    manager: EntityManager,
    shop: Shop,
  ): Promise<void> {
    const seller = await manager.getRepository(Seller).findOneBy({
      sellerId: shop.sellerId,
    });

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    if (seller.status !== SellerStatus.ACTIVE) {
      throw new ConflictException(
        'Shop cannot be approved because the seller is not active',
      );
    }

    const user = await manager.getRepository(User).findOneBy({
      userId: seller.userId,
    });

    if (!user) {
      throw new NotFoundException('Seller user account not found');
    }

    if (!user.isActive) {
      throw new ConflictException(
        'Shop cannot be approved because the seller account is inactive',
      );
    }
  }

  private buildAdminShopListResponse(shop: Shop) {
    return {
      shopId: shop.shopId,
      name: shop.name,
      description: shop.description,
      rating: shop.rating,
      status: shop.status,
      rejectionReason: shop.rejectionReason,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
      seller: {
        sellerId: shop.seller.sellerId,
        fullName: shop.seller.user.fullName,
        email: shop.seller.user.email,
      },
    };
  }

  private buildAdminShopDetailResponse(shop: Shop) {
    return {
      shopId: shop.shopId,
      name: shop.name,
      description: shop.description,
      rating: shop.rating,
      status: shop.status,
      rejectionReason: shop.rejectionReason,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
      seller: {
        sellerId: shop.seller.sellerId,
        status: shop.seller.status,
        user: {
          userId: shop.seller.user.userId,
          fullName: shop.seller.user.fullName,
          email: shop.seller.user.email,
          phone: shop.seller.user.phone,
          isActive: shop.seller.user.isActive,
        },
      },
    };
  }

  private buildShopResponse(shop: Shop) {
    return {
      shopId: shop.shopId,
      sellerId: shop.sellerId,
      name: shop.name,
      description: shop.description,
      rating: shop.rating,
      status: shop.status,
      rejectionReason: shop.rejectionReason,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as PostgresDriverError;
    return driverError.code === POSTGRES_UNIQUE_VIOLATION;
  }
}

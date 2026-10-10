import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  EntityManager,
  In,
  Repository,
} from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { Order } from '../order/entities/order.entity.js';
import { OrderStatus } from '../order/enums/order-status.enum.js';
import { Seller } from '../seller/entities/seller.entity.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { ShopStatus } from '../shop/enums/shop-status.enum.js';
import { User } from '../user/entities/user.entity.js';
import { AdminUserQueryDto } from './dto/admin-user-query.dto.js';

@Injectable()
export class AdminUserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async getUsers(query: AdminUserQueryDto) {
    const { page, limit } = query;
    const userQuery = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.userId',
        'user.fullName',
        'user.email',
        'user.phone',
        'user.role',
        'user.isActive',
        'user.createdAt',
        'user.updatedAt',
      ]);

    if (query.search) {
      userQuery.andWhere(
        new Brackets((searchQuery) => {
          searchQuery
            .where('user.fullName ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('user.email ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('user.phone ILIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }

    if (query.role !== undefined) {
      userQuery.andWhere('user.role = :role', { role: query.role });
    }

    if (query.isActive !== undefined) {
      userQuery.andWhere('user.isActive = :isActive', {
        isActive: query.isActive,
      });
    }

    const [users, totalItems] = await userQuery
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.userId', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: users.map((user) => this.buildUserResponse(user)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.customer', 'customer')
      .leftJoinAndSelect('user.seller', 'seller')
      .leftJoinAndSelect('seller.shop', 'shop')
      .leftJoinAndSelect('user.admin', 'admin')
      .select([
        'user.userId',
        'user.fullName',
        'user.email',
        'user.phone',
        'user.role',
        'user.isActive',
        'user.createdAt',
        'user.updatedAt',
        'customer.customerId',
        'customer.shippingAddress',
        'customer.createdAt',
        'seller.sellerId',
        'seller.status',
        'seller.createdAt',
        'shop.shopId',
        'shop.name',
        'shop.status',
        'admin.adminId',
        'admin.createdAt',
      ])
      .where('user.userId = :userId', { userId })
      .getOne();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...this.buildUserResponse(user),
      profile: this.buildProfileResponse(user),
    };
  }

  async deactivateUser(currentAdminUserId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.findAndLockUser(manager, userId);

      if (user.userId === currentAdminUserId) {
        throw new ConflictException(
          'Admin cannot deactivate their own account',
        );
      }

      this.ensureNonAdminTarget(user);

      if (!user.isActive) {
        throw new ConflictException('User is already inactive');
      }

      if (user.role === UserRole.SELLER) {
        await this.ensureSellerCanBeDeactivated(manager, user.userId);
      }

      user.isActive = false;
      const savedUser = await manager.getRepository(User).save(user);

      return {
        userId: savedUser.userId,
        isActive: savedUser.isActive,
        message: 'User deactivated successfully',
      };
    });
  }

  async activateUser(userId: string) {
    const user = await this.findUserOrFail(userId);
    this.ensureNonAdminTarget(user);

    if (user.isActive) {
      throw new ConflictException('User is already active');
    }

    user.isActive = true;
    const savedUser = await this.userRepository.save(user);

    return {
      userId: savedUser.userId,
      isActive: savedUser.isActive,
      message: 'User activated successfully',
    };
  }

  private async findUserOrFail(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      select: {
        userId: true,
        role: true,
        isActive: true,
      },
      where: { userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async findAndLockUser(
    manager: EntityManager,
    userId: string,
  ): Promise<User> {
    const user = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .select(['user.userId', 'user.role', 'user.isActive'])
      .setLock('pessimistic_write')
      .where('user.userId = :userId', { userId })
      .getOne();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async ensureSellerCanBeDeactivated(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const seller = await manager.getRepository(Seller).findOneBy({ userId });

    if (!seller) {
      return;
    }

    const shop = await manager
      .getRepository(Shop)
      .createQueryBuilder('shop')
      .setLock('pessimistic_write')
      .where('shop.sellerId = :sellerId', { sellerId: seller.sellerId })
      .getOne();

    if (!shop) {
      return;
    }

    if (shop.status === ShopStatus.ACTIVE) {
      throw new ConflictException(
        'Seller shop must be suspended before deactivating the seller account',
      );
    }

    const hasActiveOrders = await manager.getRepository(Order).existsBy({
      shopId: shop.shopId,
      status: In([
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.SHIPPING,
      ]),
    });

    if (hasActiveOrders) {
      throw new ConflictException(
        'Seller cannot be deactivated while active orders still exist',
      );
    }
  }

  private ensureNonAdminTarget(user: User): void {
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Admin accounts cannot be managed through this endpoint',
      );
    }
  }

  private buildUserResponse(user: User) {
    return {
      userId: user.userId,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private buildProfileResponse(user: User) {
    if (user.role === UserRole.CUSTOMER) {
      return user.customer
        ? {
            customerId: user.customer.customerId,
            shippingAddress: user.customer.shippingAddress,
            createdAt: user.customer.createdAt,
          }
        : null;
    }

    if (user.role === UserRole.SELLER) {
      return user.seller
        ? {
            sellerId: user.seller.sellerId,
            status: user.seller.status,
            createdAt: user.seller.createdAt,
            shop: user.seller.shop
              ? {
                  shopId: user.seller.shop.shopId,
                  name: user.seller.shop.name,
                  status: user.seller.shop.status,
                }
              : null,
          }
        : null;
    }

    return user.admin
      ? {
          adminId: user.admin.adminId,
          createdAt: user.admin.createdAt,
        }
      : null;
  }
}

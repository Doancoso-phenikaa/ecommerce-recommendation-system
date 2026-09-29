import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { Product } from '../product/entities/product.entity.js';
import { ProductStatus } from '../product/enums/product-status.enum.js';
import { ShopStatus } from '../shop/enums/shop-status.enum.js';
import { WishlistItem } from './entities/wishlist-item.entity.js';
import { Wishlist } from './entities/wishlist.entity.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  code?: string;
}

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Wishlist)
    private readonly wishlistRepository: Repository<Wishlist>,
    @InjectRepository(WishlistItem)
    private readonly wishlistItemRepository: Repository<WishlistItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  async getWishlist(userId: string) {
    const customer = await this.findCustomerOrFail(userId);
    const wishlist = await this.wishlistRepository.findOneBy({
      customerId: customer.customerId,
    });

    if (!wishlist) {
      return { items: [] };
    }

    const items = await this.wishlistItemRepository
      .createQueryBuilder('wishlistItem')
      .innerJoinAndSelect('wishlistItem.product', 'product')
      .innerJoin('product.shop', 'shop')
      .where('wishlistItem.wishlistId = :wishlistId', {
        wishlistId: wishlist.wishlistId,
      })
      .andWhere('product.status = :productStatus', {
        productStatus: ProductStatus.APPROVED,
      })
      .andWhere('shop.status = :shopStatus', {
        shopStatus: ShopStatus.ACTIVE,
      })
      .orderBy('wishlistItem.createdAt', 'DESC')
      .addOrderBy('wishlistItem.wishlistItemId', 'DESC')
      .getMany();

    return {
      items: items.map((item) =>
        this.buildWishlistItemResponse(item, item.product),
      ),
    };
  }

  async addProduct(userId: string, productId: string) {
    const customer = await this.findCustomerOrFail(userId);
    const product = await this.findAvailableProductOrFail(productId);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const wishlistRepository = manager.getRepository(Wishlist);
        const wishlistItemRepository = manager.getRepository(WishlistItem);

        await wishlistRepository
          .createQueryBuilder()
          .insert()
          .into(Wishlist)
          .values({ customerId: customer.customerId })
          .orIgnore()
          .execute();

        const wishlist = await wishlistRepository.findOneBy({
          customerId: customer.customerId,
        });

        if (!wishlist) {
          throw new NotFoundException('Wishlist not found');
        }

        const itemExists = await wishlistItemRepository.existsBy({
          wishlistId: wishlist.wishlistId,
          productId,
        });

        if (itemExists) {
          throw new ConflictException('Product is already in wishlist');
        }

        const item = await wishlistItemRepository.save(
          wishlistItemRepository.create({
            wishlistId: wishlist.wishlistId,
            productId,
          }),
        );

        return this.buildWishlistItemResponse(item, product);
      });
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Product is already in wishlist');
      }

      throw error;
    }
  }

  async removeProduct(userId: string, productId: string) {
    const customer = await this.findCustomerOrFail(userId);
    const wishlist = await this.wishlistRepository.findOneBy({
      customerId: customer.customerId,
    });

    if (!wishlist) {
      throw new NotFoundException('Wishlist not found');
    }

    const item = await this.wishlistItemRepository.findOneBy({
      wishlistId: wishlist.wishlistId,
      productId,
    });

    if (!item) {
      throw new NotFoundException('Product is not in wishlist');
    }

    await this.wishlistItemRepository.remove(item);

    return {
      message: 'Product removed from wishlist',
      productId,
    };
  }

  private async findCustomerOrFail(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOneBy({ userId });

    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    return customer;
  }

  private async findAvailableProductOrFail(
    productId: string,
  ): Promise<Product> {
    const product = await this.productRepository
      .createQueryBuilder('product')
      .innerJoin('product.shop', 'shop')
      .where('product.productId = :productId', { productId })
      .andWhere('product.status = :productStatus', {
        productStatus: ProductStatus.APPROVED,
      })
      .andWhere('shop.status = :shopStatus', {
        shopStatus: ShopStatus.ACTIVE,
      })
      .getOne();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private buildWishlistItemResponse(item: WishlistItem, product: Product) {
    return {
      wishlistItemId: item.wishlistItemId,
      productId: product.productId,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
      shopId: product.shopId,
      createdAt: item.createdAt,
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

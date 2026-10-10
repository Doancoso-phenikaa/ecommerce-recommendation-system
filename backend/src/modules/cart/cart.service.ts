import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { Inventory } from '../inventory/entities/inventory.entity.js';
import { Product } from '../product/entities/product.entity.js';
import { ProductStatus } from '../product/enums/product-status.enum.js';
import { ShopStatus } from '../shop/enums/shop-status.enum.js';
import { UserBehaviorService } from '../user-behavior/user-behavior.service.js';
import { BehaviorType } from '../user-behavior/enums/behavior-type.enum.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { CartItem } from './entities/cart-item.entity.js';
import { Cart } from './entities/cart.entity.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  code?: string;
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    private readonly dataSource: DataSource,
    private readonly userBehaviorService: UserBehaviorService,
  ) {}

  async getCart(userId: string) {
    const customer = await this.findCustomerOrFail(userId);
    const cart = await this.cartRepository.findOneBy({
      customerId: customer.customerId,
    });

    if (!cart) {
      return {
        items: [],
        totalAmount: '0.00',
      };
    }

    const items = await this.cartItemRepository
      .createQueryBuilder('cartItem')
      .leftJoinAndSelect('cartItem.product', 'product')
      .leftJoinAndSelect('product.shop', 'shop')
      .leftJoinAndSelect('product.inventory', 'inventory')
      .where('cartItem.cartId = :cartId', { cartId: cart.cartId })
      .orderBy('cartItem.createdAt', 'ASC')
      .addOrderBy('cartItem.cartItemId', 'ASC')
      .getMany();

    let totalAmountInCents = 0n;
    const responseItems = items.map((item) => {
      if (item.product) {
        totalAmountInCents +=
          this.priceToCents(item.product.price) * BigInt(item.quantity);
      }

      return this.buildCartReadItemResponse(item);
    });

    return {
      items: responseItems,
      totalAmount: this.formatCents(totalAmountInCents),
    };
  }

  async addItem(userId: string, addCartItemDto: AddCartItemDto) {
    const customer = await this.findCustomerOrFail(userId);

    try {
      const response = await this.dataSource.transaction(async (manager) => {
        const cartRepository = manager.getRepository(Cart);
        const cartItemRepository = manager.getRepository(CartItem);

        await cartRepository
          .createQueryBuilder()
          .insert()
          .into(Cart)
          .values({ customerId: customer.customerId })
          .orIgnore()
          .execute();

        const cart = await cartRepository
          .createQueryBuilder('cart')
          .setLock('pessimistic_write')
          .where('cart.customerId = :customerId', {
            customerId: customer.customerId,
          })
          .getOne();

        if (!cart) {
          throw new NotFoundException('Cart not found');
        }

        const { product, inventory } = await this.findAvailableProductOrFail(
          manager.getRepository(Product),
          addCartItemDto.productId,
        );
        const availableQuantity =
          inventory.quantity - inventory.reservedQuantity;
        const existingItem = await cartItemRepository.findOneBy({
          cartId: cart.cartId,
          productId: product.productId,
        });
        const newQuantity =
          (existingItem?.quantity ?? 0) + addCartItemDto.quantity;

        this.ensureQuantityAvailable(newQuantity, availableQuantity);

        const item =
          existingItem ??
          cartItemRepository.create({
            cartId: cart.cartId,
            productId: product.productId,
            quantity: 0,
          });
        item.quantity = newQuantity;

        const savedItem = await cartItemRepository.save(item);
        return this.buildCartItemResponse(savedItem, product, inventory);
      });

      await this.userBehaviorService.recordBehavior(
        customer.customerId,
        addCartItemDto.productId,
        BehaviorType.ADD_CART,
      );

      return response;
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Product is already being added to cart');
      }

      throw error;
    }
  }

  async updateItem(
    userId: string,
    productId: string,
    updateCartItemDto: UpdateCartItemDto,
  ) {
    const customer = await this.findCustomerOrFail(userId);

    return this.dataSource.transaction(async (manager) => {
      const cart = await manager
        .getRepository(Cart)
        .createQueryBuilder('cart')
        .setLock('pessimistic_write')
        .where('cart.customerId = :customerId', {
          customerId: customer.customerId,
        })
        .getOne();

      if (!cart) {
        throw new NotFoundException('Cart not found');
      }

      const cartItemRepository = manager.getRepository(CartItem);
      const item = await cartItemRepository.findOneBy({
        cartId: cart.cartId,
        productId,
      });

      if (!item) {
        throw new NotFoundException('Product is not in cart');
      }

      const { product, inventory } = await this.findAvailableProductOrFail(
        manager.getRepository(Product),
        productId,
      );
      const availableQuantity = inventory.quantity - inventory.reservedQuantity;

      this.ensureQuantityAvailable(
        updateCartItemDto.quantity,
        availableQuantity,
      );

      item.quantity = updateCartItemDto.quantity;
      const savedItem = await cartItemRepository.save(item);

      return this.buildCartItemResponse(savedItem, product, inventory);
    });
  }

  async removeItem(userId: string, productId: string) {
    const customer = await this.findCustomerOrFail(userId);

    return this.dataSource.transaction(async (manager) => {
      const cart = await manager
        .getRepository(Cart)
        .createQueryBuilder('cart')
        .setLock('pessimistic_write')
        .where('cart.customerId = :customerId', {
          customerId: customer.customerId,
        })
        .getOne();

      if (!cart) {
        throw new NotFoundException('Cart not found');
      }

      const cartItemRepository = manager.getRepository(CartItem);
      const item = await cartItemRepository.findOneBy({
        cartId: cart.cartId,
        productId,
      });

      if (!item) {
        throw new NotFoundException('Product is not in cart');
      }

      await cartItemRepository.remove(item);

      return {
        message: 'Product removed from cart',
        productId,
      };
    });
  }

  private async findCustomerOrFail(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOneBy({ userId });

    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    return customer;
  }

  private async findAvailableProductOrFail(
    productRepository: Repository<Product>,
    productId: string,
  ): Promise<{ product: Product; inventory: Inventory }> {
    const product = await productRepository
      .createQueryBuilder('product')
      .innerJoin('product.shop', 'shop')
      .innerJoinAndSelect('product.inventory', 'inventory')
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

    if (!product.inventory) {
      throw new NotFoundException('Inventory not found');
    }

    return { product, inventory: product.inventory };
  }

  private ensureQuantityAvailable(
    requestedQuantity: number,
    availableQuantity: number,
  ): void {
    if (requestedQuantity > availableQuantity) {
      throw new BadRequestException(
        `Only ${availableQuantity} product(s) are currently available`,
      );
    }
  }

  private buildCartItemResponse(
    item: CartItem,
    product: Product,
    inventory?: Inventory,
  ) {
    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }

    const subtotalInCents =
      this.priceToCents(product.price) * BigInt(item.quantity);

    return {
      productId: product.productId,
      name: product.name,
      imageUrl: product.imageUrl,
      price: product.price,
      quantity: item.quantity,
      availableQuantity: inventory.quantity - inventory.reservedQuantity,
      subtotal: this.formatCents(subtotalInCents),
    };
  }

  private buildCartReadItemResponse(item: CartItem) {
    const product = item.product;

    if (!product) {
      return {
        productId: item.productId,
        name: null,
        imageUrl: null,
        price: null,
        quantity: item.quantity,
        availableQuantity: 0,
        subtotal: null,
        isAvailable: false,
        unavailableReason: 'PRODUCT_NOT_AVAILABLE',
      };
    }

    const inventory = product.inventory;
    const calculatedAvailableQuantity = inventory
      ? inventory.quantity - inventory.reservedQuantity
      : 0;
    const availableQuantity =
      calculatedAvailableQuantity > 0 ? calculatedAvailableQuantity : 0;
    const subtotalInCents =
      this.priceToCents(product.price) * BigInt(item.quantity);

    let unavailableReason: string | null = null;

    if (product.status !== ProductStatus.APPROVED) {
      unavailableReason = 'PRODUCT_NOT_AVAILABLE';
    } else if (!product.shop || product.shop.status !== ShopStatus.ACTIVE) {
      unavailableReason = 'SHOP_NOT_ACTIVE';
    } else if (!inventory) {
      unavailableReason = 'PRODUCT_NOT_AVAILABLE';
    } else if (availableQuantity < item.quantity) {
      unavailableReason = 'INSUFFICIENT_STOCK';
    }

    return {
      productId: product.productId,
      name: product.name,
      imageUrl: product.imageUrl,
      price: product.price,
      quantity: item.quantity,
      availableQuantity,
      subtotal: this.formatCents(subtotalInCents),
      isAvailable: unavailableReason === null,
      unavailableReason,
    };
  }

  private priceToCents(price: string): bigint {
    const [wholePart, fractionPart = ''] = price.split('.');
    return BigInt(wholePart) * 100n + BigInt(fractionPart.padEnd(2, '0'));
  }

  private formatCents(value: bigint): string {
    const wholePart = value / 100n;
    const fractionPart = (value % 100n).toString().padStart(2, '0');
    return `${wholePart}.${fractionPart}`;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as PostgresDriverError;
    return driverError.code === POSTGRES_UNIQUE_VIOLATION;
  }
}

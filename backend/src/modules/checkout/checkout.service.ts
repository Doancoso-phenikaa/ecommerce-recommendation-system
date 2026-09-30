import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CartItem } from '../cart/entities/cart-item.entity.js';
import { Cart } from '../cart/entities/cart.entity.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Discount } from '../discount/entities/discount.entity.js';
import { DiscountStatus } from '../discount/enums/discount-status.enum.js';
import { DiscountType } from '../discount/enums/discount-type.enum.js';
import { Inventory } from '../inventory/entities/inventory.entity.js';
import { OrderGroup } from '../order/entities/order-group.entity.js';
import { OrderItem } from '../order/entities/order-item.entity.js';
import { Order } from '../order/entities/order.entity.js';
import { OrderStatus } from '../order/enums/order-status.enum.js';
import { Product } from '../product/entities/product.entity.js';
import { ProductStatus } from '../product/enums/product-status.enum.js';
import { ShopStatus } from '../shop/enums/shop-status.enum.js';
import { CheckoutPreviewDto } from './dto/checkout-preview.dto.js';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto.js';

export interface CheckoutPreviewItem {
  productId: string;
  name: string;
  imageUrl: string | null;
  price: string;
  quantity: number;
  availableQuantity: number;
  subtotal: string;
}

export interface CheckoutPreviewShopGroup {
  shopId: string;
  shopName: string;
  items: CheckoutPreviewItem[];
  subtotal: string;
}

export interface CheckoutPreviewResponse {
  shopGroups: CheckoutPreviewShopGroup[];
  cartSubtotal: string;
  discount: CheckoutPreviewDiscount | null;
  discountAmount: string;
  finalTotal: string;
}

export interface CheckoutPreviewDiscount {
  discountId: string;
  code: string;
  type: DiscountType;
  value: string;
}

interface PreviewShopGroupAccumulator {
  shopId: string;
  shopName: string;
  items: CheckoutPreviewItem[];
  subtotalInCents: bigint;
}

interface ConfirmCheckoutLine {
  cartItem: CartItem;
  product: Product;
  inventory: Inventory;
  subtotalInCents: bigint;
}

interface ConfirmShopGroupAccumulator {
  shopId: string;
  items: ConfirmCheckoutLine[];
  subtotalInCents: bigint;
}

export interface ConfirmCheckoutOrderItemResponse {
  orderItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface ConfirmCheckoutOrderResponse {
  orderId: string;
  shopId: string;
  subtotal: string;
  discountAmount: string;
  shippingFee: string;
  totalAmount: string;
  shippingAddress: string;
  shippingMethod: string | null;
  status: OrderStatus;
  items: ConfirmCheckoutOrderItemResponse[];
}

export interface ConfirmCheckoutResponse {
  orderGroupId: string;
  cartSubtotal: string;
  discount: {
    discountId: string;
    code: string;
  } | null;
  discountAmount: string;
  totalAmount: string;
  orders: ConfirmCheckoutOrderResponse[];
  createdAt: Date;
}

@Injectable()
export class CheckoutService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    @InjectRepository(Discount)
    private readonly discountRepository: Repository<Discount>,
    private readonly dataSource: DataSource,
  ) {}

  async previewCheckout(
    userId: string,
    checkoutPreviewDto?: CheckoutPreviewDto,
  ): Promise<CheckoutPreviewResponse> {
    const customer = await this.customerRepository.findOneBy({ userId });

    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    const cart = await this.cartRepository.findOneBy({
      customerId: customer.customerId,
    });

    if (!cart) {
      throw new BadRequestException('Cart is empty');
    }

    const cartItems = await this.cartItemRepository
      .createQueryBuilder('cartItem')
      .innerJoinAndSelect('cartItem.product', 'product')
      .innerJoinAndSelect('product.shop', 'shop')
      .leftJoinAndSelect('product.inventory', 'inventory')
      .where('cartItem.cartId = :cartId', { cartId: cart.cartId })
      .orderBy('cartItem.createdAt', 'ASC')
      .addOrderBy('cartItem.cartItemId', 'ASC')
      .getMany();

    if (cartItems.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const groupsByShop = new Map<string, PreviewShopGroupAccumulator>();
    let cartSubtotalInCents = 0n;

    for (const cartItem of cartItems) {
      const product = cartItem.product;
      const shop = product.shop;
      const inventory = product.inventory;

      if (product.status !== ProductStatus.APPROVED) {
        throw new BadRequestException(
          `Product ${product.productId} (${product.name}) is not approved`,
        );
      }

      if (shop.status !== ShopStatus.ACTIVE) {
        throw new BadRequestException(
          `Shop for product ${product.productId} (${product.name}) is not active`,
        );
      }

      if (!inventory) {
        throw new BadRequestException(
          `Inventory for product ${product.productId} (${product.name}) was not found`,
        );
      }

      const availableQuantity = inventory.quantity - inventory.reservedQuantity;

      if (cartItem.quantity > availableQuantity) {
        throw new BadRequestException(
          `Product ${product.productId} (${product.name}) has insufficient stock; only ${availableQuantity} available`,
        );
      }

      const subtotalInCents =
        this.priceToCents(product.price) * BigInt(cartItem.quantity);
      let shopGroup = groupsByShop.get(shop.shopId);

      if (!shopGroup) {
        shopGroup = {
          shopId: shop.shopId,
          shopName: shop.name,
          items: [],
          subtotalInCents: 0n,
        };
        groupsByShop.set(shop.shopId, shopGroup);
      }

      shopGroup.items.push({
        productId: product.productId,
        name: product.name,
        imageUrl: product.imageUrl,
        price: product.price,
        quantity: cartItem.quantity,
        availableQuantity,
        subtotal: this.formatCents(subtotalInCents),
      });
      shopGroup.subtotalInCents += subtotalInCents;
      cartSubtotalInCents += subtotalInCents;
    }

    const shopGroups = Array.from(groupsByShop.values(), (shopGroup) => ({
      shopId: shopGroup.shopId,
      shopName: shopGroup.shopName,
      items: shopGroup.items,
      subtotal: this.formatCents(shopGroup.subtotalInCents),
    }));
    const discount = await this.findAndValidateDiscount(
      checkoutPreviewDto?.discountCode,
      cartSubtotalInCents,
    );
    const discountAmountInCents = discount
      ? this.calculateDiscountAmount(cartSubtotalInCents, discount)
      : 0n;
    const finalTotalInCents = cartSubtotalInCents - discountAmountInCents;

    return {
      shopGroups,
      cartSubtotal: this.formatCents(cartSubtotalInCents),
      discount: discount
        ? {
            discountId: discount.discountId,
            code: discount.code,
            type: discount.type,
            value: discount.value,
          }
        : null,
      discountAmount: this.formatCents(discountAmountInCents),
      finalTotal: this.formatCents(finalTotalInCents),
    };
  }

  async confirmCheckout(
    userId: string,
    confirmCheckoutDto: ConfirmCheckoutDto,
  ): Promise<ConfirmCheckoutResponse> {
    return this.dataSource.transaction(async (manager) => {
      const customer = await manager
        .getRepository(Customer)
        .findOneBy({ userId });

      if (!customer) {
        throw new NotFoundException('Customer profile not found');
      }

      const cart = await manager
        .getRepository(Cart)
        .createQueryBuilder('cart')
        .setLock('pessimistic_write')
        .where('cart.customerId = :customerId', {
          customerId: customer.customerId,
        })
        .getOne();

      if (!cart) {
        throw new BadRequestException('Cart is empty');
      }

      const cartItemRepository = manager.getRepository(CartItem);
      const cartItems = await cartItemRepository
        .createQueryBuilder('cartItem')
        .innerJoinAndSelect('cartItem.product', 'product')
        .innerJoinAndSelect('product.shop', 'shop')
        .where('cartItem.cartId = :cartId', { cartId: cart.cartId })
        .orderBy('cartItem.productId', 'ASC')
        .getMany();

      if (cartItems.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      const inventoriesByProductId = await this.lockInventories(
        manager,
        cartItems.map((cartItem) => cartItem.productId),
      );
      const { shopGroups, cartSubtotalInCents } =
        this.groupAndValidateCartItems(cartItems, inventoriesByProductId);
      const discount = await this.findAndLockDiscount(
        manager,
        confirmCheckoutDto.discountCode,
        cartSubtotalInCents,
      );
      const discountAmountInCents = discount
        ? this.calculateDiscountAmount(cartSubtotalInCents, discount)
        : 0n;
      const finalTotalInCents = cartSubtotalInCents - discountAmountInCents;
      const discountAllocations = this.allocateDiscountByShop(
        shopGroups,
        cartSubtotalInCents,
        discountAmountInCents,
      );

      const orderGroupRepository = manager.getRepository(OrderGroup);
      const orderGroup = await orderGroupRepository.save(
        orderGroupRepository.create({
          customerId: customer.customerId,
          totalAmount: this.formatCents(finalTotalInCents),
        }),
      );
      const orderRepository = manager.getRepository(Order);
      const orderItemRepository = manager.getRepository(OrderItem);
      const orders: ConfirmCheckoutOrderResponse[] = [];

      for (const shopGroup of shopGroups) {
        const shopDiscountInCents =
          discountAllocations.get(shopGroup.shopId) ?? 0n;
        const shippingFeeInCents = 0n;
        const orderTotalInCents =
          shopGroup.subtotalInCents - shopDiscountInCents + shippingFeeInCents;
        const order = await orderRepository.save(
          orderRepository.create({
            orderGroupId: orderGroup.orderGroupId,
            shopId: shopGroup.shopId,
            discountId: discount?.discountId ?? null,
            subtotal: this.formatCents(shopGroup.subtotalInCents),
            discountAmount: this.formatCents(shopDiscountInCents),
            shippingFee: this.formatCents(shippingFeeInCents),
            totalAmount: this.formatCents(orderTotalInCents),
            shippingAddress: confirmCheckoutDto.shippingAddress.trim(),
            shippingMethod: confirmCheckoutDto.shippingMethod?.trim() || null,
            status: OrderStatus.PENDING,
          }),
        );
        const savedOrderItems = await orderItemRepository.save(
          shopGroup.items.map((line) =>
            orderItemRepository.create({
              orderId: order.orderId,
              productId: line.product.productId,
              productName: line.product.name,
              quantity: line.cartItem.quantity,
              unitPrice: line.product.price,
              subtotal: this.formatCents(line.subtotalInCents),
            }),
          ),
        );

        orders.push({
          orderId: order.orderId,
          shopId: order.shopId,
          subtotal: order.subtotal,
          discountAmount: order.discountAmount,
          shippingFee: order.shippingFee,
          totalAmount: order.totalAmount,
          shippingAddress: order.shippingAddress,
          shippingMethod: order.shippingMethod,
          status: order.status,
          items: savedOrderItems.map((orderItem) => ({
            orderItemId: orderItem.orderItemId,
            productId: orderItem.productId,
            productName: orderItem.productName,
            quantity: orderItem.quantity,
            unitPrice: orderItem.unitPrice,
            subtotal: orderItem.subtotal,
          })),
        });
      }

      for (const shopGroup of shopGroups) {
        for (const line of shopGroup.items) {
          line.inventory.reservedQuantity += line.cartItem.quantity;
        }
      }

      await manager
        .getRepository(Inventory)
        .save(Array.from(inventoriesByProductId.values()));

      if (discount) {
        await manager
          .getRepository(Discount)
          .increment({ discountId: discount.discountId }, 'usedCount', 1);
      }

      await cartItemRepository.delete({ cartId: cart.cartId });

      return {
        orderGroupId: orderGroup.orderGroupId,
        cartSubtotal: this.formatCents(cartSubtotalInCents),
        discount: discount
          ? {
              discountId: discount.discountId,
              code: discount.code,
            }
          : null,
        discountAmount: this.formatCents(discountAmountInCents),
        totalAmount: orderGroup.totalAmount,
        orders,
        createdAt: orderGroup.createdAt,
      };
    });
  }

  private async findAndValidateDiscount(
    discountCode: string | undefined,
    cartSubtotalInCents: bigint,
  ): Promise<Discount | null> {
    const normalizedCode = discountCode?.trim().toUpperCase();

    if (!normalizedCode) {
      return null;
    }

    const discount = await this.discountRepository.findOneBy({
      code: normalizedCode,
    });

    if (!discount) {
      throw new BadRequestException('Discount code is invalid');
    }

    this.validateDiscount(discount, cartSubtotalInCents);
    return discount;
  }

  private async findAndLockDiscount(
    manager: EntityManager,
    discountCode: string | undefined,
    cartSubtotalInCents: bigint,
  ): Promise<Discount | null> {
    const normalizedCode = discountCode?.trim().toUpperCase();

    if (!normalizedCode) {
      return null;
    }

    const discount = await manager
      .getRepository(Discount)
      .createQueryBuilder('discount')
      .setLock('pessimistic_write')
      .where('discount.code = :code', { code: normalizedCode })
      .getOne();

    if (!discount) {
      throw new BadRequestException('Discount code is invalid');
    }

    this.validateDiscount(discount, cartSubtotalInCents);
    return discount;
  }

  private validateDiscount(
    discount: Discount,
    cartSubtotalInCents: bigint,
  ): void {
    if (discount.status !== DiscountStatus.ACTIVE) {
      throw new BadRequestException('Discount is inactive');
    }

    const now = new Date();

    if (now.getTime() < discount.startDate.getTime()) {
      throw new BadRequestException('Discount is not active yet');
    }

    if (now.getTime() > discount.endDate.getTime()) {
      throw new BadRequestException('Discount has expired');
    }

    if (
      discount.usageLimit !== null &&
      discount.usedCount >= discount.usageLimit
    ) {
      throw new BadRequestException('Discount usage limit has been reached');
    }

    if (cartSubtotalInCents < this.priceToCents(discount.minOrderAmount)) {
      throw new BadRequestException(
        `Cart subtotal must be at least ${discount.minOrderAmount} to use this discount`,
      );
    }
  }

  private async lockInventories(
    manager: EntityManager,
    productIds: string[],
  ): Promise<Map<string, Inventory>> {
    const sortedProductIds = Array.from(new Set(productIds)).sort(
      (left, right) =>
        BigInt(left) < BigInt(right)
          ? -1
          : BigInt(left) > BigInt(right)
            ? 1
            : 0,
    );
    const inventories = await manager
      .getRepository(Inventory)
      .createQueryBuilder('inventory')
      .setLock('pessimistic_write')
      .where('inventory.productId IN (:...productIds)', {
        productIds: sortedProductIds,
      })
      .orderBy('inventory.productId', 'ASC')
      .getMany();

    return new Map(
      inventories.map((inventory) => [inventory.productId, inventory]),
    );
  }

  private groupAndValidateCartItems(
    cartItems: CartItem[],
    inventoriesByProductId: Map<string, Inventory>,
  ): {
    shopGroups: ConfirmShopGroupAccumulator[];
    cartSubtotalInCents: bigint;
  } {
    const groupsByShop = new Map<string, ConfirmShopGroupAccumulator>();
    let cartSubtotalInCents = 0n;

    for (const cartItem of cartItems) {
      const product = cartItem.product;
      const shop = product.shop;
      const inventory = inventoriesByProductId.get(product.productId);

      if (product.status !== ProductStatus.APPROVED) {
        throw new BadRequestException(
          `Product ${product.productId} (${product.name}) is not approved`,
        );
      }

      if (shop.status !== ShopStatus.ACTIVE) {
        throw new BadRequestException(
          `Shop for product ${product.productId} (${product.name}) is not active`,
        );
      }

      if (!inventory) {
        throw new BadRequestException(
          `Inventory for product ${product.productId} (${product.name}) was not found`,
        );
      }

      const availableQuantity = inventory.quantity - inventory.reservedQuantity;

      if (cartItem.quantity > availableQuantity) {
        throw new BadRequestException(
          `Product ${product.productId} (${product.name}) has insufficient stock; only ${availableQuantity} available`,
        );
      }

      const subtotalInCents =
        this.priceToCents(product.price) * BigInt(cartItem.quantity);
      let shopGroup = groupsByShop.get(shop.shopId);

      if (!shopGroup) {
        shopGroup = {
          shopId: shop.shopId,
          items: [],
          subtotalInCents: 0n,
        };
        groupsByShop.set(shop.shopId, shopGroup);
      }

      shopGroup.items.push({
        cartItem,
        product,
        inventory,
        subtotalInCents,
      });
      shopGroup.subtotalInCents += subtotalInCents;
      cartSubtotalInCents += subtotalInCents;
    }

    return {
      shopGroups: Array.from(groupsByShop.values()),
      cartSubtotalInCents,
    };
  }

  private allocateDiscountByShop(
    shopGroups: ConfirmShopGroupAccumulator[],
    cartSubtotalInCents: bigint,
    discountAmountInCents: bigint,
  ): Map<string, bigint> {
    const allocations = new Map<string, bigint>();
    let allocatedInCents = 0n;

    shopGroups.forEach((shopGroup, index) => {
      const isLastGroup = index === shopGroups.length - 1;
      const allocationInCents = isLastGroup
        ? discountAmountInCents - allocatedInCents
        : (discountAmountInCents * shopGroup.subtotalInCents) /
          cartSubtotalInCents;

      allocations.set(shopGroup.shopId, allocationInCents);
      allocatedInCents += allocationInCents;
    });

    const lastGroup = shopGroups.at(-1);

    if (lastGroup) {
      const lastAllocation = allocations.get(lastGroup.shopId) ?? 0n;
      let overflowInCents = lastAllocation - lastGroup.subtotalInCents;

      if (overflowInCents > 0n) {
        allocations.set(lastGroup.shopId, lastGroup.subtotalInCents);

        for (let index = shopGroups.length - 2; index >= 0; index -= 1) {
          const shopGroup = shopGroups[index];
          const currentAllocation = allocations.get(shopGroup.shopId) ?? 0n;
          const availableCapacity =
            shopGroup.subtotalInCents - currentAllocation;
          const amountToMove =
            overflowInCents < availableCapacity
              ? overflowInCents
              : availableCapacity;

          allocations.set(shopGroup.shopId, currentAllocation + amountToMove);
          overflowInCents -= amountToMove;

          if (overflowInCents === 0n) {
            break;
          }
        }

        if (overflowInCents !== 0n) {
          throw new Error('Unable to allocate discount across orders');
        }
      }
    }

    return allocations;
  }

  private calculateDiscountAmount(
    cartSubtotalInCents: bigint,
    discount: Discount,
  ): bigint {
    const calculatedAmount =
      discount.type === DiscountType.PERCENT
        ? (cartSubtotalInCents * this.priceToCents(discount.value)) / 10_000n
        : this.priceToCents(discount.value);

    return calculatedAmount > cartSubtotalInCents
      ? cartSubtotalInCents
      : calculatedAmount;
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
}

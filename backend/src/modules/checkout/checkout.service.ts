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
import { DiscountTarget } from '../discount/enums/discount-target.enum.js';
import { DiscountType } from '../discount/enums/discount-type.enum.js';
import { Inventory } from '../inventory/entities/inventory.entity.js';
import { OrderGroup } from '../order/entities/order-group.entity.js';
import { OrderItem } from '../order/entities/order-item.entity.js';
import { Order } from '../order/entities/order.entity.js';
import { OrderStatus } from '../order/enums/order-status.enum.js';
import { Product } from '../product/entities/product.entity.js';
import { ProductStatus } from '../product/enums/product-status.enum.js';
import { ShopStatus } from '../shop/enums/shop-status.enum.js';
import { BehaviorType } from '../user-behavior/enums/behavior-type.enum.js';
import { UserBehaviorService } from '../user-behavior/user-behavior.service.js';
import { ShippingConfigService } from '../shipping-config/shipping-config.service.js';
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
  productDiscountAmount: string;
  totalAmount: string;
}

export interface CheckoutPreviewResponse {
  shopGroups: CheckoutPreviewShopGroup[];
  subtotal: string;
  cartSubtotal: string;
  productDiscount: CheckoutPreviewDiscount | null;
  shippingDiscount: CheckoutPreviewDiscount | null;
  productDiscountAmount: string;
  shippingFee: string;
  shippingDiscountAmount: string;
  totalAmount: string;
  /** @deprecated Use productDiscount. */
  discount: CheckoutPreviewDiscount | null;
  /** @deprecated Use productDiscountAmount. */
  discountAmount: string;
  /** @deprecated Use totalAmount. */
  finalTotal: string;
}

export interface CheckoutPreviewDiscount {
  discountId: string;
  code: string;
  type: DiscountType;
  target: DiscountTarget;
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
  totalAmount: string;
  shippingAddress: string;
  shippingMethod: string | null;
  status: OrderStatus;
  items: ConfirmCheckoutOrderItemResponse[];
}

export interface ConfirmCheckoutResponse {
  orderGroupId: string;
  subtotal: string;
  cartSubtotal: string;
  productDiscount: {
    discountId: string;
    code: string;
  } | null;
  shippingDiscount: {
    discountId: string;
    code: string;
  } | null;
  productDiscountAmount: string;
  shippingFee: string;
  shippingDiscountAmount: string;
  /** @deprecated Use productDiscount. */
  discount: {
    discountId: string;
    code: string;
  } | null;
  /** @deprecated Use productDiscountAmount. */
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
    private readonly userBehaviorService: UserBehaviorService,
    private readonly shippingConfigService: ShippingConfigService,
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

    const shopGroupAccumulators = Array.from(groupsByShop.values());
    const shippingConfig = await this.shippingConfigService.getConfig();
    const shippingFeeInCents = this.priceToCents(
      shippingConfig.defaultShippingFee,
    );
    const productDiscount = await this.findAndValidateDiscount(
      checkoutPreviewDto?.productDiscountCode,
      cartSubtotalInCents,
      DiscountTarget.PRODUCT,
    );
    const shippingDiscount = await this.findAndValidateDiscount(
      checkoutPreviewDto?.shippingDiscountCode,
      cartSubtotalInCents,
      DiscountTarget.SHIPPING,
    );
    const productDiscountAmountInCents = productDiscount
      ? this.calculateDiscountAmount(cartSubtotalInCents, productDiscount)
      : 0n;
    const shippingDiscountAmountInCents = shippingDiscount
      ? this.calculateDiscountAmount(
          shippingFeeInCents,
          shippingDiscount,
        )
      : 0n;
    const productDiscountAllocations = this.allocateAmountByShop(
      shopGroupAccumulators,
      cartSubtotalInCents,
      productDiscountAmountInCents,
      (shopGroup) => shopGroup.subtotalInCents,
    );
    const shopGroups = shopGroupAccumulators.map((shopGroup) => {
      const shopProductDiscountInCents =
        productDiscountAllocations.get(shopGroup.shopId) ?? 0n;
      const totalAmountInCents =
        shopGroup.subtotalInCents - shopProductDiscountInCents;

      return {
        shopId: shopGroup.shopId,
        shopName: shopGroup.shopName,
        items: shopGroup.items,
        subtotal: this.formatCents(shopGroup.subtotalInCents),
        productDiscountAmount: this.formatCents(
          shopProductDiscountInCents,
        ),
        totalAmount: this.formatCents(totalAmountInCents),
      };
    });
    const totalAmountInCents =
      cartSubtotalInCents -
      productDiscountAmountInCents +
      shippingFeeInCents -
      shippingDiscountAmountInCents;

    return {
      shopGroups,
      subtotal: this.formatCents(cartSubtotalInCents),
      cartSubtotal: this.formatCents(cartSubtotalInCents),
      productDiscount: this.buildPreviewDiscount(productDiscount),
      shippingDiscount: this.buildPreviewDiscount(shippingDiscount),
      productDiscountAmount: this.formatCents(
        productDiscountAmountInCents,
      ),
      shippingFee: this.formatCents(shippingFeeInCents),
      shippingDiscountAmount: this.formatCents(
        shippingDiscountAmountInCents,
      ),
      totalAmount: this.formatCents(totalAmountInCents),
      discount: this.buildPreviewDiscount(productDiscount),
      discountAmount: this.formatCents(productDiscountAmountInCents),
      finalTotal: this.formatCents(totalAmountInCents),
    };
  }

  async confirmCheckout(
    userId: string,
    confirmCheckoutDto: ConfirmCheckoutDto,
  ): Promise<ConfirmCheckoutResponse> {
    const transactionResult = await this.dataSource.transaction(
      async (manager) => {
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
        const productDiscount = await this.findAndLockDiscount(
          manager,
          confirmCheckoutDto.productDiscountCode,
          cartSubtotalInCents,
          DiscountTarget.PRODUCT,
        );
        const shippingDiscount = await this.findAndLockDiscount(
          manager,
          confirmCheckoutDto.shippingDiscountCode,
          cartSubtotalInCents,
          DiscountTarget.SHIPPING,
        );
        const shippingConfig = await this.shippingConfigService.lockConfig(
          manager,
          'pessimistic_read',
        );
        const shippingFeeInCents = this.priceToCents(
          shippingConfig.defaultShippingFee,
        );
        const productDiscountAmountInCents = productDiscount
          ? this.calculateDiscountAmount(cartSubtotalInCents, productDiscount)
          : 0n;
        const shippingDiscountAmountInCents = shippingDiscount
          ? this.calculateDiscountAmount(
              shippingFeeInCents,
              shippingDiscount,
            )
          : 0n;
        const finalTotalInCents =
          cartSubtotalInCents -
          productDiscountAmountInCents +
          shippingFeeInCents -
          shippingDiscountAmountInCents;
        const productDiscountAllocations = this.allocateAmountByShop(
          shopGroups,
          cartSubtotalInCents,
          productDiscountAmountInCents,
          (shopGroup) => shopGroup.subtotalInCents,
        );
        const orderGroupRepository = manager.getRepository(OrderGroup);
        const orderGroup = await orderGroupRepository.save(
          orderGroupRepository.create({
            customerId: customer.customerId,
            shippingFee: this.formatCents(shippingFeeInCents),
            shippingDiscountAmount: this.formatCents(
              shippingDiscountAmountInCents,
            ),
            totalAmount: this.formatCents(finalTotalInCents),
          }),
        );
        const orderRepository = manager.getRepository(Order);
        const orderItemRepository = manager.getRepository(OrderItem);
        const orders: ConfirmCheckoutOrderResponse[] = [];

        for (const shopGroup of shopGroups) {
          const shopDiscountInCents =
            productDiscountAllocations.get(shopGroup.shopId) ?? 0n;
          const orderTotalInCents =
            shopGroup.subtotalInCents - shopDiscountInCents;
          const order = await orderRepository.save(
            orderRepository.create({
              orderGroupId: orderGroup.orderGroupId,
              shopId: shopGroup.shopId,
              discountId: productDiscount?.discountId ?? null,
              subtotal: this.formatCents(shopGroup.subtotalInCents),
              discountAmount: this.formatCents(shopDiscountInCents),
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

        const usedDiscounts = [productDiscount, shippingDiscount].filter(
          (discount): discount is Discount => discount !== null,
        );

        if (usedDiscounts.length > 0) {
          for (const discount of usedDiscounts) {
            discount.usedCount += 1;
          }
          await manager.getRepository(Discount).save(usedDiscounts);
        }

        await cartItemRepository.delete({ cartId: cart.cartId });

        return {
          customerId: customer.customerId,
          productIds: Array.from(
            new Set(cartItems.map((cartItem) => cartItem.productId)),
          ),
          response: {
            orderGroupId: orderGroup.orderGroupId,
            subtotal: this.formatCents(cartSubtotalInCents),
            cartSubtotal: this.formatCents(cartSubtotalInCents),
            productDiscount: productDiscount
              ? {
                  discountId: productDiscount.discountId,
                  code: productDiscount.code,
                }
              : null,
            shippingDiscount: shippingDiscount
              ? {
                  discountId: shippingDiscount.discountId,
                  code: shippingDiscount.code,
                }
              : null,
            productDiscountAmount: this.formatCents(
              productDiscountAmountInCents,
            ),
            shippingFee: orderGroup.shippingFee,
            shippingDiscountAmount: this.formatCents(
              shippingDiscountAmountInCents,
            ),
            discount: productDiscount
              ? {
                  discountId: productDiscount.discountId,
                  code: productDiscount.code,
                }
              : null,
            discountAmount: this.formatCents(productDiscountAmountInCents),
            totalAmount: orderGroup.totalAmount,
            orders,
            createdAt: orderGroup.createdAt,
          },
        };
      },
    );

    await Promise.all(
      transactionResult.productIds.map((productId) =>
        this.userBehaviorService.recordBehavior(
          transactionResult.customerId,
          productId,
          BehaviorType.PURCHASE,
        ),
      ),
    );

    return transactionResult.response;
  }

  private async findAndValidateDiscount(
    discountCode: string | undefined,
    cartSubtotalInCents: bigint,
    expectedTarget: DiscountTarget,
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

    this.validateDiscount(discount, cartSubtotalInCents, expectedTarget);
    return discount;
  }

  private async findAndLockDiscount(
    manager: EntityManager,
    discountCode: string | undefined,
    cartSubtotalInCents: bigint,
    expectedTarget: DiscountTarget,
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

    this.validateDiscount(discount, cartSubtotalInCents, expectedTarget);
    return discount;
  }

  private validateDiscount(
    discount: Discount,
    cartSubtotalInCents: bigint,
    expectedTarget: DiscountTarget,
  ): void {
    if (discount.target !== expectedTarget) {
      throw new BadRequestException(
        expectedTarget === DiscountTarget.PRODUCT
          ? 'Product discount code must target PRODUCT'
          : 'Shipping discount code must target SHIPPING',
      );
    }

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

  private allocateAmountByShop<T extends { shopId: string }>(
    shopGroups: T[],
    totalWeightInCents: bigint,
    amountInCents: bigint,
    getWeightInCents: (shopGroup: T) => bigint,
  ): Map<string, bigint> {
    const allocations = new Map<string, bigint>();
    let allocatedInCents = 0n;

    if (shopGroups.length === 0 || amountInCents === 0n) {
      return allocations;
    }

    if (totalWeightInCents <= 0n || amountInCents > totalWeightInCents) {
      throw new Error('Invalid discount allocation values');
    }

    shopGroups.forEach((shopGroup, index) => {
      const isLastGroup = index === shopGroups.length - 1;
      const allocationInCents = isLastGroup
        ? amountInCents - allocatedInCents
        : (amountInCents * getWeightInCents(shopGroup)) /
          totalWeightInCents;

      allocations.set(shopGroup.shopId, allocationInCents);
      allocatedInCents += allocationInCents;
    });

    const lastGroup = shopGroups.at(-1);

    if (lastGroup) {
      const lastAllocation = allocations.get(lastGroup.shopId) ?? 0n;
      let overflowInCents =
        lastAllocation - getWeightInCents(lastGroup);

      if (overflowInCents > 0n) {
        allocations.set(lastGroup.shopId, getWeightInCents(lastGroup));

        for (let index = shopGroups.length - 2; index >= 0; index -= 1) {
          const shopGroup = shopGroups[index];
          const currentAllocation = allocations.get(shopGroup.shopId) ?? 0n;
          const availableCapacity =
            getWeightInCents(shopGroup) - currentAllocation;
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

  private buildPreviewDiscount(
    discount: Discount | null,
  ): CheckoutPreviewDiscount | null {
    return discount
      ? {
          discountId: discount.discountId,
          code: discount.code,
          type: discount.type,
          target: discount.target,
          value: discount.value,
        }
      : null;
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

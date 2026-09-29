import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CartItem } from '../cart/entities/cart-item.entity.js';
import { Cart } from '../cart/entities/cart.entity.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Discount } from '../discount/entities/discount.entity.js';
import { DiscountStatus } from '../discount/enums/discount-status.enum.js';
import { DiscountType } from '../discount/enums/discount-type.enum.js';
import { ProductStatus } from '../product/enums/product-status.enum.js';
import { ShopStatus } from '../shop/enums/shop-status.enum.js';
import { CheckoutPreviewDto } from './dto/checkout-preview.dto.js';

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

    return discount;
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

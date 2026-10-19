import { Discount } from '../discount/entities/discount.entity.js';
import { DiscountStatus } from '../discount/enums/discount-status.enum.js';
import { DiscountTarget } from '../discount/enums/discount-target.enum.js';
import { DiscountType } from '../discount/enums/discount-type.enum.js';
import { CheckoutService } from './checkout.service.js';

interface ShopWeight {
  shopId: string;
  weightInCents: bigint;
}

interface CheckoutMoneyHarness {
  calculateDiscountAmount(
    baseAmountInCents: bigint,
    discount: Pick<Discount, 'type' | 'value'>,
  ): bigint;
  allocateAmountByShop<T extends { shopId: string }>(
    shopGroups: T[],
    totalWeightInCents: bigint,
    amountInCents: bigint,
    getWeightInCents: (shopGroup: T) => bigint,
  ): Map<string, bigint>;
  validateDiscount(
    discount: Discount,
    cartSubtotalInCents: bigint,
    expectedTarget: DiscountTarget,
  ): void;
}

describe('CheckoutService shipping and discount money rules', () => {
  const service = Object.create(
    CheckoutService.prototype,
  ) as CheckoutMoneyHarness;
  const subtotalInCents = 80_000_000n;
  const shippingFeeInCents = 3_000_000n;

  it('calculates no-discount, product-only, shipping-only and stacked totals', () => {
    const productDiscount = service.calculateDiscountAmount(
      subtotalInCents,
      { type: DiscountType.PERCENT, value: '10' },
    );
    const shippingDiscount = service.calculateDiscountAmount(
      shippingFeeInCents,
      { type: DiscountType.FIXED, value: '20000' },
    );

    expect(subtotalInCents + shippingFeeInCents).toBe(83_000_000n);
    expect(subtotalInCents - productDiscount + shippingFeeInCents).toBe(
      75_000_000n,
    );
    expect(subtotalInCents + shippingFeeInCents - shippingDiscount).toBe(
      81_000_000n,
    );
    expect(
      subtotalInCents -
        productDiscount +
        shippingFeeInCents -
        shippingDiscount,
    ).toBe(73_000_000n);
  });

  it('caps a shipping discount at the total shipping fee', () => {
    expect(
      service.calculateDiscountAmount(shippingFeeInCents, {
        type: DiscountType.FIXED,
        value: '100000',
      }),
    ).toBe(shippingFeeInCents);
  });

  it('allocates product discount exactly with the last-shop remainder', () => {
    const groups: ShopWeight[] = [
      { shopId: '1', weightInCents: 3_000_000n },
      { shopId: '2', weightInCents: 3_000_000n },
    ];
    const allocations = service.allocateAmountByShop(
      groups,
      6_000_000n,
      3_000_000n,
      (group) => group.weightInCents,
    );

    expect(allocations.get('1')).toBe(1_500_000n);
    expect(allocations.get('2')).toBe(1_500_000n);
    expect(
      Array.from(allocations.values()).reduce(
        (total, amount) => total + amount,
        0n,
      ),
    ).toBe(3_000_000n);
  });

  it('rejects a discount used in the wrong target field', () => {
    const discount = {
      target: DiscountTarget.SHIPPING,
      status: DiscountStatus.ACTIVE,
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      usageLimit: null,
      usedCount: 0,
      minOrderAmount: '0.00',
    } as Discount;

    expect(() =>
      service.validateDiscount(
        discount,
        subtotalInCents,
        DiscountTarget.PRODUCT,
      ),
    ).toThrow('Product discount code must target PRODUCT');
  });
});

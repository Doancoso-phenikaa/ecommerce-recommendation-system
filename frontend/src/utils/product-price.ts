const DECIMAL_MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;

function moneyToMinorUnits(value: string): bigint | null {
  const normalized = value.trim();
  if (!DECIMAL_MONEY_PATTERN.test(normalized)) return null;

  const [wholePart, fractionPart = ''] = normalized.split('.');
  return BigInt(wholePart) * 100n + BigInt(fractionPart.padEnd(2, '0'));
}

export function isOriginalPriceGreaterThanPrice(
  price: string,
  originalPrice: string,
): boolean {
  const priceInMinorUnits = moneyToMinorUnits(price);
  const originalPriceInMinorUnits = moneyToMinorUnits(originalPrice);

  return (
    priceInMinorUnits !== null &&
    originalPriceInMinorUnits !== null &&
    originalPriceInMinorUnits > priceInMinorUnits
  );
}

export function getProductDiscountPercentage(
  price: string,
  originalPrice: string | null,
): number | null {
  if (!originalPrice) return null;

  const priceInMinorUnits = moneyToMinorUnits(price);
  const originalPriceInMinorUnits = moneyToMinorUnits(originalPrice);

  if (
    priceInMinorUnits === null ||
    originalPriceInMinorUnits === null ||
    originalPriceInMinorUnits <= priceInMinorUnits
  ) {
    return null;
  }

  const difference = originalPriceInMinorUnits - priceInMinorUnits;
  const roundedPercentage =
    (difference * 100n + originalPriceInMinorUnits / 2n) /
    originalPriceInMinorUnits;

  return Number(roundedPercentage);
}

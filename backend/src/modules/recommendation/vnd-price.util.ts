/**
 * Recommendation payloads keep the generic `*_cents` field name, but VND
 * has no fractional minor unit. Convert a database decimal string to an
 * integer number of dong without passing through JavaScript floating point.
 */
export function vndDecimalToMinorUnits(value: string): number {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim());

  if (!match) {
    throw new Error('VND unit price must be a non-negative decimal string');
  }

  const fraction = (match[2] ?? '').padEnd(2, '0');

  if (fraction !== '00') {
    throw new Error('VND unit price must not contain fractional dong');
  }

  const minorUnits = BigInt(match[1]);

  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('VND unit price exceeds the safe JSON integer range');
  }

  return Number(minorUnits);
}

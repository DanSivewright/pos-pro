const CENTS_PER_RAND = 100;

// Formats integer cents as Rand, e.g. 1257100 -> "R12,571.00", -14550 -> "-R145.50".
export function formatRand(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const rands = Math.abs(cents) / CENTS_PER_RAND;
  const amount = rands.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}R${amount}`;
}

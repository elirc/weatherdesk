/** Money is stored as integer kobo (₦1 = 100 kobo). Never floats. */

export function koboToNaira(kobo: number): number {
  return kobo / 100;
}

export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

const nairaFmt = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** e.g. "₦5,000" for 500000 kobo. */
export function formatKobo(kobo: number): string {
  return nairaFmt.format(kobo / 100);
}

// ─── Global exchange rate store ───────────────────────────
// Updated automatically by useExchangeRate hook.
// Fallback: 60 DOP/USD (approximate).
let _globalRate = 60;

export function setGlobalExchangeRate(rate: number) {
  if (rate > 0) _globalRate = rate;
}

export function getGlobalExchangeRate(): number {
  return _globalRate;
}

// ─── Primary display currency: DOP (RD$) ─────────────────
// All amounts stored in USD are converted automatically.

/** Format a USD amount as RD$ using the current exchange rate */
export function formatUSD(amountUsd: number): string {
  const dop = amountUsd * _globalRate;
  return formatDOP(dop);
}

/** Format a raw DOP amount */
export function formatDOP(amount: number): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount).replace('DOP', 'RD$').replace('RD$ ', 'RD$');
}

/** Format explicitly in USD (for rare cases where USD display is needed) */
export function formatRawUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Convert USD to DOP and format */
export function usdToDOP(amountUsd: number, rate: number): string {
  return formatDOP(amountUsd * rate);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('es-DO').format(n);
}

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

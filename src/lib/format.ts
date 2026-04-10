export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDOP(amount: number): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount).replace('DOP', 'RD$').replace('RD$ ', 'RD$');
}

/** Convert USD to DOP and format */
export function usdToDOP(amountUsd: number, rate: number): string {
  return formatDOP(amountUsd * rate);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

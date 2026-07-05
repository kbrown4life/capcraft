export function formatMoney(value) {
  return `$${Number(value || 0).toFixed(1)}m`;
}

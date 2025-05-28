/**
 * Formats a number with commas as thousand separators and maintains decimal precision
 */
export const formatAmount = (amount: number | null | undefined, minimumFractionDigits = 0, maximumFractionDigits = 0): string => {
  if (amount === null || amount === undefined) return '-';
  
  return amount.toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping: true
  });
};

/**
 * Formats a currency amount with the currency symbol
 */
const formatCurrency = (amount: number | null | undefined, currencyCode: string): string => {
  if (amount === null || amount === undefined) return '-';
  
  return `${currencyCode} ${formatAmount(amount)}`;
};

/**
 * Returns the start and end date of the current month
 */
export const getDateRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end };
};
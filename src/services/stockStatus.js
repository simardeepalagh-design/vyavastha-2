export const isLowStock = (qty, threshold) =>
  Number(threshold) > 0 && Number(qty) <= Number(threshold);

export const getStockStatus = (qty, threshold) => {
  if (Number(qty) === 0) return 'Out of Stock';
  return isLowStock(qty, threshold) ? 'Low Stock' : 'Healthy';
};

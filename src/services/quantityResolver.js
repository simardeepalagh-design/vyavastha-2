/**
 * Decides the quantity to use for stock operations (addition vs deduction),
 * resolving requested vs. granted/issued quantity for deduction/SIV bills.
 *
 * @param {Object} item - Extracted item object from AI/OCR parser
 * @param {boolean} isAdd - true if adding stock, false if deducting stock (SIV)
 * @returns {Object} { qty: number, isAmbiguous: boolean, warningMessage?: string }
 */
export function resolveItemQuantity(item, isAdd) {
  // 1. If explicitly flagged as ambiguous header structure by AI/OCR
  if (item.qty_ambiguous || item.is_ambiguous) {
    const fallbackQty = item.issued_qty ?? item.qty ?? item.requested_qty ?? 0;
    return {
      qty: Number(fallbackQty),
      isAmbiguous: true,
      warningMessage: 'Ambiguous quantity headers detected on bill. Please verify actual issued quantity.'
    };
  }

  // 2. FOR STOCK DEDUCTION / SIV FLOW (!isAdd):
  if (!isAdd) {
    // If BOTH requested_qty and issued_qty are present (or if issued_qty is present),
    // ALWAYS use issued_qty (granted/issued quantity), NEVER the requested quantity.
    if (
      item.issued_qty !== undefined &&
      item.issued_qty !== null &&
      item.issued_qty !== '' &&
      !isNaN(Number(item.issued_qty))
    ) {
      return {
        qty: Number(item.issued_qty),
        isAmbiguous: false
      };
    }

    // Single quantity column present on deduction bill
    if (
      item.qty !== undefined &&
      item.qty !== null &&
      item.qty !== '' &&
      !isNaN(Number(item.qty))
    ) {
      return {
        qty: Number(item.qty),
        isAmbiguous: false
      };
    }
  } else {
    // 3. FOR STOCK ADDITION FLOW (isAdd):
    const finalQty = item.qty ?? item.issued_qty ?? item.requested_qty ?? 0;
    return {
      qty: Number(finalQty),
      isAmbiguous: false
    };
  }

  return {
    qty: Number(item.qty ?? 0),
    isAmbiguous: false
  };
}

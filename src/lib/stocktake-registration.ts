type ExistingInventory = {
  quantity: number;
  actualQuantity: number | null;
} | null;

export function resolveStocktakeRegistration(
  inventory: ExistingInventory,
  requestedQuantity: number
) {
  if (inventory) {
    return {
      alreadyRegistered: true,
      countedQuantity: inventory.actualQuantity ?? inventory.quantity,
    };
  }

  return {
    alreadyRegistered: false,
    countedQuantity: requestedQuantity,
  };
}

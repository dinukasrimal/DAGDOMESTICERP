export interface UnitConversion {
  from: string;
  to: string;
  factor: number;
}

export interface RawMaterial {
  id: number;
  base_unit: string;
  purchase_unit: string;
  conversion_factor: number;
}

/**
 * Convert quantity from purchase unit to base unit
 */
export function convertToBaseUnit(
  quantity: number,
  material: Pick<RawMaterial, 'conversion_factor' | 'purchase_unit' | 'base_unit'>
): number {
  return quantity * material.conversion_factor;
}

/**
 * Convert quantity from base unit to purchase unit
 */
export function convertToPurchaseUnit(
  quantity: number,
  material: Pick<RawMaterial, 'conversion_factor' | 'purchase_unit' | 'base_unit'>
): number {
  return quantity / material.conversion_factor;
}

/**
 * Get formatted unit display with quantity
 */
export function formatQuantityWithUnit(quantity: number, unit: string): string {
  return `${quantity.toLocaleString()} ${unit}`;
}

/**
 * Common unit categories and their standard conversions
 */
export const UNIT_CATEGORIES = {
  weight: {
    base: 'kg',
    units: [
      { name: 'grams', symbol: 'g', toBase: 0.001 },
      { name: 'kilograms', symbol: 'kg', toBase: 1 },
      { name: 'tons', symbol: 't', toBase: 1000 },
      { name: 'pounds', symbol: 'lb', toBase: 0.453592 },
      { name: 'ounces', symbol: 'oz', toBase: 0.0283495 }
    ]
  },
  length: {
    base: 'meters',
    units: [
      { name: 'millimeters', symbol: 'mm', toBase: 0.001 },
      { name: 'centimeters', symbol: 'cm', toBase: 0.01 },
      { name: 'meters', symbol: 'm', toBase: 1 },
      { name: 'kilometers', symbol: 'km', toBase: 1000 },
      { name: 'inches', symbol: 'in', toBase: 0.0254 },
      { name: 'feet', symbol: 'ft', toBase: 0.3048 },
      { name: 'yards', symbol: 'yd', toBase: 0.9144 }
    ]
  },
  area: {
    base: 'square_meters',
    units: [
      { name: 'square centimeters', symbol: 'cm²', toBase: 0.0001 },
      { name: 'square meters', symbol: 'm²', toBase: 1 },
      { name: 'square feet', symbol: 'ft²', toBase: 0.092903 },
      { name: 'square yards', symbol: 'yd²', toBase: 0.836127 }
    ]
  },
  volume: {
    base: 'liters',
    units: [
      { name: 'milliliters', symbol: 'ml', toBase: 0.001 },
      { name: 'liters', symbol: 'l', toBase: 1 },
      { name: 'gallons', symbol: 'gal', toBase: 3.78541 },
      { name: 'fluid ounces', symbol: 'fl oz', toBase: 0.0295735 }
    ]
  },
  count: {
    base: 'pieces',
    units: [
      { name: 'pieces', symbol: 'pcs', toBase: 1 },
      { name: 'dozens', symbol: 'doz', toBase: 12 },
      { name: 'gross', symbol: 'gr', toBase: 144 },
      { name: 'pairs', symbol: 'pr', toBase: 2 }
    ]
  }
};

/**
 * Get unit suggestions based on category
 */
export function getUnitSuggestions(category?: keyof typeof UNIT_CATEGORIES): string[] {
  if (category && UNIT_CATEGORIES[category]) {
    return UNIT_CATEGORIES[category].units.map(unit => unit.symbol);
  }
  
  // Return all units if no category specified
  return Object.values(UNIT_CATEGORIES).flatMap(cat => 
    cat.units.map(unit => unit.symbol)
  );
}

/**
 * Validate if conversion factor makes sense
 */
export function validateConversionFactor(
  baseUnit: string,
  purchaseUnit: string,
  factor: number
): { valid: boolean; message?: string } {
  if (factor <= 0) {
    return { valid: false, message: 'Conversion factor must be positive' };
  }

  // If units are the same, factor should be 1
  if (baseUnit === purchaseUnit && factor !== 1) {
    return { valid: false, message: 'Same units should have conversion factor of 1' };
  }

  // Check if factor seems reasonable for common conversions
  if (factor > 10000) {
    return { valid: false, message: 'Conversion factor seems unusually high' };
  }

  return { valid: true };
}

/**
 * Calculate cost per base unit from cost per purchase unit
 */
export function calculateCostPerBaseUnit(
  costPerPurchaseUnit: number,
  conversionFactor: number
): number {
  return costPerPurchaseUnit / conversionFactor;
}

/**
 * Calculate total cost for a quantity in base units
 */
export function calculateTotalCost(
  quantityInBaseUnits: number,
  costPerPurchaseUnit: number,
  conversionFactor: number
): number {
  const costPerBaseUnit = calculateCostPerBaseUnit(costPerPurchaseUnit, conversionFactor);
  return quantityInBaseUnits * costPerBaseUnit;
}
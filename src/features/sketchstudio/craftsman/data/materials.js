/**
 * Material catalog for Craftsman Studio.
 * Each material has physical properties and pricing for BOM cost estimation.
 */

const materials = [
  // --- Plywood ---
  { id: 'birch-plywood-3', name: '3mm Birch Plywood', category: 'plywood', thickness: 3, defaultWidth: 2440, defaultHeight: 1220, pricePerM2: 12.00, costBasis: 'perM2', density: 680, color: '#E8D5B7' },
  { id: 'birch-plywood-6', name: '6mm Birch Plywood', category: 'plywood', thickness: 6, defaultWidth: 2440, defaultHeight: 1220, pricePerM2: 22.00, costBasis: 'perM2', density: 680, color: '#E0CCAA' },
  { id: 'birch-plywood-12', name: '12mm Birch Plywood', category: 'plywood', thickness: 12, defaultWidth: 2440, defaultHeight: 1220, pricePerM2: 35.00, costBasis: 'perM2', density: 680, color: '#D4BE97' },
  { id: 'birch-plywood-18', name: '18mm Birch Plywood', category: 'plywood', thickness: 18, defaultWidth: 2440, defaultHeight: 1220, pricePerM2: 45.00, costBasis: 'perM2', density: 680, color: '#D4A574' },
  { id: 'birch-plywood-24', name: '24mm Birch Plywood', category: 'plywood', thickness: 24, defaultWidth: 2440, defaultHeight: 1220, pricePerM2: 58.00, costBasis: 'perM2', density: 680, color: '#C89B6A' },
  { id: 'marine-plywood-18', name: '18mm Marine Plywood', category: 'plywood', thickness: 18, defaultWidth: 2440, defaultHeight: 1220, pricePerM2: 72.00, costBasis: 'perM2', density: 700, color: '#B8955E' },

  // --- MDF ---
  { id: 'mdf-6', name: '6mm MDF', category: 'mdf', thickness: 6, defaultWidth: 2440, defaultHeight: 1220, pricePerM2: 8.00, costBasis: 'perM2', density: 750, color: '#C4A882' },
  { id: 'mdf-12', name: '12mm MDF', category: 'mdf', thickness: 12, defaultWidth: 2440, defaultHeight: 1220, pricePerM2: 14.00, costBasis: 'perM2', density: 750, color: '#B89C76' },
  { id: 'mdf-18', name: '18mm MDF', category: 'mdf', thickness: 18, defaultWidth: 2440, defaultHeight: 1220, pricePerM2: 20.00, costBasis: 'perM2', density: 750, color: '#AC906A' },

  // --- Lumber (priced per linear meter) ---
  { id: 'pine-20x45', name: 'Pine 20x45mm', category: 'lumber', thickness: 20, defaultWidth: 45, defaultHeight: 2400, pricePerM2: 1.20, costBasis: 'perLinearMeter', density: 500, color: '#F0D9A8' },
  { id: 'pine-20x95', name: 'Pine 20x95mm', category: 'lumber', thickness: 20, defaultWidth: 95, defaultHeight: 2400, pricePerM2: 2.10, costBasis: 'perLinearMeter', density: 500, color: '#E8D09E' },
  { id: 'pine-45x45', name: 'Pine 45x45mm', category: 'lumber', thickness: 45, defaultWidth: 45, defaultHeight: 2400, pricePerM2: 2.80, costBasis: 'perLinearMeter', density: 500, color: '#DFC794' },
  { id: 'pine-45x95', name: 'Pine 45x95mm', category: 'lumber', thickness: 45, defaultWidth: 95, defaultHeight: 2400, pricePerM2: 4.50, costBasis: 'perLinearMeter', density: 500, color: '#D6BE8A' },
  { id: 'oak-20x95', name: 'Oak 20x95mm', category: 'lumber', thickness: 20, defaultWidth: 95, defaultHeight: 2400, pricePerM2: 12.00, costBasis: 'perLinearMeter', density: 700, color: '#A0784C' },
  { id: 'walnut-20x95', name: 'Walnut 20x95mm', category: 'lumber', thickness: 20, defaultWidth: 95, defaultHeight: 2400, pricePerM2: 24.00, costBasis: 'perLinearMeter', density: 640, color: '#5C3D2E' },

  // --- Metal ---
  { id: 'aluminum-1', name: '1mm Aluminum Sheet', category: 'metal', thickness: 1, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 18.00, costBasis: 'perM2', density: 2700, color: '#C0C0C0' },
  { id: 'aluminum-2', name: '2mm Aluminum Sheet', category: 'metal', thickness: 2, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 32.00, costBasis: 'perM2', density: 2700, color: '#B0B0B0' },
  { id: 'steel-1', name: '1mm Mild Steel Sheet', category: 'metal', thickness: 1, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 14.00, costBasis: 'perM2', density: 7850, color: '#808080' },
  { id: 'steel-2', name: '2mm Mild Steel Sheet', category: 'metal', thickness: 2, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 26.00, costBasis: 'perM2', density: 7850, color: '#707070' },

  // --- Acrylic ---
  { id: 'acrylic-3', name: '3mm Clear Acrylic', category: 'acrylic', thickness: 3, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 28.00, costBasis: 'perM2', density: 1180, color: '#E0F0FF' },
  { id: 'acrylic-5', name: '5mm Clear Acrylic', category: 'acrylic', thickness: 5, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 42.00, costBasis: 'perM2', density: 1180, color: '#D0E8FF' },
  { id: 'acrylic-6-black', name: '6mm Black Acrylic', category: 'acrylic', thickness: 6, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 48.00, costBasis: 'perM2', density: 1180, color: '#1A1A1A' },
];

export const MATERIAL_CATEGORIES = [
  { id: 'plywood', label: 'Plywood' },
  { id: 'mdf', label: 'MDF' },
  { id: 'lumber', label: 'Lumber' },
  { id: 'metal', label: 'Metal' },
  { id: 'acrylic', label: 'Acrylic' },
];

export function getMaterialById(id) {
  return materials.find((m) => m.id === id) ?? null;
}

export function getMaterialsByCategory(category) {
  return materials.filter((m) => m.category === category);
}

export function buildMaterialPricingDict() {
  const pricing = {};
  for (const m of materials) {
    pricing[m.id] = { unitCost: m.pricePerM2, costBasis: m.costBasis };
  }
  return pricing;
}

export default materials;

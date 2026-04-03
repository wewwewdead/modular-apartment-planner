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

  // --- Metal (Sheets) ---
  { id: 'aluminum-0.5', name: '0.5mm Aluminum Sheet', category: 'metal', thickness: 0.5, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 10.00, costBasis: 'perM2', density: 2700, color: '#CACACA' },
  { id: 'aluminum-0.8', name: '0.8mm Aluminum Sheet', category: 'metal', thickness: 0.8, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 14.00, costBasis: 'perM2', density: 2700, color: '#C5C5C5' },
  { id: 'aluminum-1', name: '1mm Aluminum Sheet', category: 'metal', thickness: 1, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 18.00, costBasis: 'perM2', density: 2700, color: '#C0C0C0' },
  { id: 'aluminum-1.5', name: '1.5mm Aluminum Sheet', category: 'metal', thickness: 1.5, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 25.00, costBasis: 'perM2', density: 2700, color: '#B8B8B8' },
  { id: 'aluminum-2', name: '2mm Aluminum Sheet', category: 'metal', thickness: 2, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 32.00, costBasis: 'perM2', density: 2700, color: '#B0B0B0' },
  { id: 'aluminum-3', name: '3mm Aluminum Sheet', category: 'metal', thickness: 3, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 46.00, costBasis: 'perM2', density: 2700, color: '#A8A8A8' },
  { id: 'aluminum-4', name: '4mm Aluminum Sheet', category: 'metal', thickness: 4, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 60.00, costBasis: 'perM2', density: 2700, color: '#A0A0A0' },
  { id: 'aluminum-5', name: '5mm Aluminum Sheet', category: 'metal', thickness: 5, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 74.00, costBasis: 'perM2', density: 2700, color: '#989898' },
  { id: 'aluminum-6', name: '6mm Aluminum Sheet', category: 'metal', thickness: 6, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 88.00, costBasis: 'perM2', density: 2700, color: '#909090' },
  { id: 'steel-0.5', name: '0.5mm Mild Steel Sheet', category: 'metal', thickness: 0.5, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 7.00, costBasis: 'perM2', density: 7850, color: '#8A8A8A' },
  { id: 'steel-0.8', name: '0.8mm Mild Steel Sheet', category: 'metal', thickness: 0.8, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 10.00, costBasis: 'perM2', density: 7850, color: '#858585' },
  { id: 'steel-1', name: '1mm Mild Steel Sheet', category: 'metal', thickness: 1, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 14.00, costBasis: 'perM2', density: 7850, color: '#808080' },
  { id: 'steel-1.5', name: '1.5mm Mild Steel Sheet', category: 'metal', thickness: 1.5, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 20.00, costBasis: 'perM2', density: 7850, color: '#7A7A7A' },
  { id: 'steel-2', name: '2mm Mild Steel Sheet', category: 'metal', thickness: 2, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 26.00, costBasis: 'perM2', density: 7850, color: '#707070' },
  { id: 'steel-3', name: '3mm Mild Steel Sheet', category: 'metal', thickness: 3, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 38.00, costBasis: 'perM2', density: 7850, color: '#686868' },
  { id: 'steel-4', name: '4mm Mild Steel Sheet', category: 'metal', thickness: 4, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 50.00, costBasis: 'perM2', density: 7850, color: '#606060' },
  { id: 'steel-5', name: '5mm Mild Steel Sheet', category: 'metal', thickness: 5, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 62.00, costBasis: 'perM2', density: 7850, color: '#585858' },
  { id: 'steel-6', name: '6mm Mild Steel Sheet', category: 'metal', thickness: 6, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 74.00, costBasis: 'perM2', density: 7850, color: '#505050' },
  { id: 'steel-8', name: '8mm Mild Steel Sheet', category: 'metal', thickness: 8, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 96.00, costBasis: 'perM2', density: 7850, color: '#484848' },
  { id: 'steel-10', name: '10mm Mild Steel Sheet', category: 'metal', thickness: 10, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 118.00, costBasis: 'perM2', density: 7850, color: '#404040' },
  { id: 'stainless-0.8', name: '0.8mm Stainless Steel Sheet', category: 'metal', thickness: 0.8, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 32.00, costBasis: 'perM2', density: 7930, color: '#9CA0A4' },
  { id: 'stainless-1', name: '1mm Stainless Steel Sheet', category: 'metal', thickness: 1, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 40.00, costBasis: 'perM2', density: 7930, color: '#949899' },
  { id: 'stainless-1.5', name: '1.5mm Stainless Steel Sheet', category: 'metal', thickness: 1.5, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 56.00, costBasis: 'perM2', density: 7930, color: '#8C9092' },
  { id: 'stainless-2', name: '2mm Stainless Steel Sheet', category: 'metal', thickness: 2, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 72.00, costBasis: 'perM2', density: 7930, color: '#84888A' },
  { id: 'stainless-3', name: '3mm Stainless Steel Sheet', category: 'metal', thickness: 3, defaultWidth: 2000, defaultHeight: 1000, pricePerM2: 105.00, costBasis: 'perM2', density: 7930, color: '#7C8082' },

  // --- Metal (Square Tubes) ---
  { id: 'steel-sq-20-0.8', name: 'Steel SQ Tube 20x20x0.8mm', category: 'metal', thickness: 0.8, defaultWidth: 20, defaultHeight: 6000, pricePerM2: 1.50, costBasis: 'perLinearMeter', density: 7850, color: '#727272' },
  { id: 'steel-sq-20-1', name: 'Steel SQ Tube 20x20x1mm', category: 'metal', thickness: 1, defaultWidth: 20, defaultHeight: 6000, pricePerM2: 1.80, costBasis: 'perLinearMeter', density: 7850, color: '#6F6F6F' },
  { id: 'steel-sq-20', name: 'Steel SQ Tube 20x20x1.5mm', category: 'metal', thickness: 1.5, defaultWidth: 20, defaultHeight: 6000, pricePerM2: 2.40, costBasis: 'perLinearMeter', density: 7850, color: '#6C6C6C' },
  { id: 'steel-sq-25-1', name: 'Steel SQ Tube 25x25x1mm', category: 'metal', thickness: 1, defaultWidth: 25, defaultHeight: 6000, pricePerM2: 2.20, costBasis: 'perLinearMeter', density: 7850, color: '#6B6B6B' },
  { id: 'steel-sq-25', name: 'Steel SQ Tube 25x25x1.5mm', category: 'metal', thickness: 1.5, defaultWidth: 25, defaultHeight: 6000, pricePerM2: 3.20, costBasis: 'perLinearMeter', density: 7850, color: '#686868' },
  { id: 'steel-sq-25-2', name: 'Steel SQ Tube 25x25x2mm', category: 'metal', thickness: 2, defaultWidth: 25, defaultHeight: 6000, pricePerM2: 3.80, costBasis: 'perLinearMeter', density: 7850, color: '#656565' },
  { id: 'steel-sq-30-1.5', name: 'Steel SQ Tube 30x30x1.5mm', category: 'metal', thickness: 1.5, defaultWidth: 30, defaultHeight: 6000, pricePerM2: 3.80, costBasis: 'perLinearMeter', density: 7850, color: '#646464' },
  { id: 'steel-sq-30-2', name: 'Steel SQ Tube 30x30x2mm', category: 'metal', thickness: 2, defaultWidth: 30, defaultHeight: 6000, pricePerM2: 4.60, costBasis: 'perLinearMeter', density: 7850, color: '#626262' },
  { id: 'steel-sq-40-1.5', name: 'Steel SQ Tube 40x40x1.5mm', category: 'metal', thickness: 1.5, defaultWidth: 40, defaultHeight: 6000, pricePerM2: 4.80, costBasis: 'perLinearMeter', density: 7850, color: '#616161' },
  { id: 'steel-sq-40', name: 'Steel SQ Tube 40x40x2mm', category: 'metal', thickness: 2, defaultWidth: 40, defaultHeight: 6000, pricePerM2: 5.80, costBasis: 'perLinearMeter', density: 7850, color: '#606060' },
  { id: 'steel-sq-40-3', name: 'Steel SQ Tube 40x40x3mm', category: 'metal', thickness: 3, defaultWidth: 40, defaultHeight: 6000, pricePerM2: 8.20, costBasis: 'perLinearMeter', density: 7850, color: '#5D5D5D' },
  { id: 'steel-sq-50-2', name: 'Steel SQ Tube 50x50x2mm', category: 'metal', thickness: 2, defaultWidth: 50, defaultHeight: 6000, pricePerM2: 7.40, costBasis: 'perLinearMeter', density: 7850, color: '#5C5C5C' },
  { id: 'steel-sq-50-3', name: 'Steel SQ Tube 50x50x3mm', category: 'metal', thickness: 3, defaultWidth: 50, defaultHeight: 6000, pricePerM2: 10.50, costBasis: 'perLinearMeter', density: 7850, color: '#5A5A5A' },
  { id: 'steel-sq-60-2', name: 'Steel SQ Tube 60x60x2mm', category: 'metal', thickness: 2, defaultWidth: 60, defaultHeight: 6000, pricePerM2: 8.80, costBasis: 'perLinearMeter', density: 7850, color: '#595959' },
  { id: 'steel-sq-60-3', name: 'Steel SQ Tube 60x60x3mm', category: 'metal', thickness: 3, defaultWidth: 60, defaultHeight: 6000, pricePerM2: 12.60, costBasis: 'perLinearMeter', density: 7850, color: '#575757' },
  { id: 'steel-sq-80-2', name: 'Steel SQ Tube 80x80x2mm', category: 'metal', thickness: 2, defaultWidth: 80, defaultHeight: 6000, pricePerM2: 11.60, costBasis: 'perLinearMeter', density: 7850, color: '#555555' },
  { id: 'steel-sq-80-3', name: 'Steel SQ Tube 80x80x3mm', category: 'metal', thickness: 3, defaultWidth: 80, defaultHeight: 6000, pricePerM2: 16.80, costBasis: 'perLinearMeter', density: 7850, color: '#535353' },
  { id: 'steel-sq-100-3', name: 'Steel SQ Tube 100x100x3mm', category: 'metal', thickness: 3, defaultWidth: 100, defaultHeight: 6000, pricePerM2: 21.00, costBasis: 'perLinearMeter', density: 7850, color: '#515151' },

  // --- Metal (Rectangular Tubes) ---
  { id: 'steel-rect-40x20-1.5', name: 'Steel Rect Tube 40x20x1.5mm', category: 'metal', thickness: 1.5, defaultWidth: 40, defaultHeight: 6000, pricePerM2: 3.60, costBasis: 'perLinearMeter', density: 7850, color: '#6A6A6A' },
  { id: 'steel-rect-40x20-2', name: 'Steel Rect Tube 40x20x2mm', category: 'metal', thickness: 2, defaultWidth: 40, defaultHeight: 6000, pricePerM2: 4.40, costBasis: 'perLinearMeter', density: 7850, color: '#676767' },
  { id: 'steel-rect-50x25-2', name: 'Steel Rect Tube 50x25x2mm', category: 'metal', thickness: 2, defaultWidth: 50, defaultHeight: 6000, pricePerM2: 5.60, costBasis: 'perLinearMeter', density: 7850, color: '#646464' },
  { id: 'steel-rect-50x30-2', name: 'Steel Rect Tube 50x30x2mm', category: 'metal', thickness: 2, defaultWidth: 50, defaultHeight: 6000, pricePerM2: 6.00, costBasis: 'perLinearMeter', density: 7850, color: '#626262' },
  { id: 'steel-rect-60x40-2', name: 'Steel Rect Tube 60x40x2mm', category: 'metal', thickness: 2, defaultWidth: 60, defaultHeight: 6000, pricePerM2: 7.40, costBasis: 'perLinearMeter', density: 7850, color: '#5F5F5F' },
  { id: 'steel-rect-60x40-3', name: 'Steel Rect Tube 60x40x3mm', category: 'metal', thickness: 3, defaultWidth: 60, defaultHeight: 6000, pricePerM2: 10.80, costBasis: 'perLinearMeter', density: 7850, color: '#5D5D5D' },
  { id: 'steel-rect-80x40-2', name: 'Steel Rect Tube 80x40x2mm', category: 'metal', thickness: 2, defaultWidth: 80, defaultHeight: 6000, pricePerM2: 8.80, costBasis: 'perLinearMeter', density: 7850, color: '#5B5B5B' },
  { id: 'steel-rect-100x50-3', name: 'Steel Rect Tube 100x50x3mm', category: 'metal', thickness: 3, defaultWidth: 100, defaultHeight: 6000, pricePerM2: 16.20, costBasis: 'perLinearMeter', density: 7850, color: '#585858' },

  // --- Metal (Round Tubes) ---
  { id: 'steel-rd-20-1', name: 'Steel Round Tube 20mm x 1mm', category: 'metal', thickness: 1, defaultWidth: 20, defaultHeight: 6000, pricePerM2: 1.60, costBasis: 'perLinearMeter', density: 7850, color: '#747474' },
  { id: 'steel-rd-20-1.5', name: 'Steel Round Tube 20mm x 1.5mm', category: 'metal', thickness: 1.5, defaultWidth: 20, defaultHeight: 6000, pricePerM2: 2.20, costBasis: 'perLinearMeter', density: 7850, color: '#717171' },
  { id: 'steel-rd-25-1', name: 'Steel Round Tube 25mm x 1mm', category: 'metal', thickness: 1, defaultWidth: 25, defaultHeight: 6000, pricePerM2: 2.00, costBasis: 'perLinearMeter', density: 7850, color: '#707070' },
  { id: 'steel-rd-25', name: 'Steel Round Tube 25mm x 1.5mm', category: 'metal', thickness: 1.5, defaultWidth: 25, defaultHeight: 6000, pricePerM2: 2.90, costBasis: 'perLinearMeter', density: 7850, color: '#6E6E6E' },
  { id: 'steel-rd-25-2', name: 'Steel Round Tube 25mm x 2mm', category: 'metal', thickness: 2, defaultWidth: 25, defaultHeight: 6000, pricePerM2: 3.60, costBasis: 'perLinearMeter', density: 7850, color: '#6C6C6C' },
  { id: 'steel-rd-32', name: 'Steel Round Tube 32mm x 2mm', category: 'metal', thickness: 2, defaultWidth: 32, defaultHeight: 6000, pricePerM2: 4.50, costBasis: 'perLinearMeter', density: 7850, color: '#656565' },
  { id: 'steel-rd-38-2', name: 'Steel Round Tube 38mm x 2mm', category: 'metal', thickness: 2, defaultWidth: 38, defaultHeight: 6000, pricePerM2: 5.40, costBasis: 'perLinearMeter', density: 7850, color: '#636363' },
  { id: 'steel-rd-42-2', name: 'Steel Round Tube 42mm x 2mm', category: 'metal', thickness: 2, defaultWidth: 42, defaultHeight: 6000, pricePerM2: 6.00, costBasis: 'perLinearMeter', density: 7850, color: '#616161' },
  { id: 'steel-rd-48-2', name: 'Steel Round Tube 48mm x 2mm', category: 'metal', thickness: 2, defaultWidth: 48, defaultHeight: 6000, pricePerM2: 7.00, costBasis: 'perLinearMeter', density: 7850, color: '#5F5F5F' },
  { id: 'steel-rd-50-2', name: 'Steel Round Tube 50mm x 2mm', category: 'metal', thickness: 2, defaultWidth: 50, defaultHeight: 6000, pricePerM2: 7.40, costBasis: 'perLinearMeter', density: 7850, color: '#5D5D5D' },
  { id: 'steel-rd-60-2', name: 'Steel Round Tube 60mm x 2mm', category: 'metal', thickness: 2, defaultWidth: 60, defaultHeight: 6000, pricePerM2: 8.80, costBasis: 'perLinearMeter', density: 7850, color: '#5B5B5B' },
  { id: 'steel-rd-76-2', name: 'Steel Round Tube 76mm x 2mm', category: 'metal', thickness: 2, defaultWidth: 76, defaultHeight: 6000, pricePerM2: 11.00, costBasis: 'perLinearMeter', density: 7850, color: '#595959' },

  // --- Metal (Angles) ---
  { id: 'steel-angle-20-3', name: 'Steel Angle 20x20x3mm', category: 'metal', thickness: 3, defaultWidth: 20, defaultHeight: 6000, pricePerM2: 2.20, costBasis: 'perLinearMeter', density: 7850, color: '#5E5E5E' },
  { id: 'steel-angle-25', name: 'Steel Angle 25x25x3mm', category: 'metal', thickness: 3, defaultWidth: 25, defaultHeight: 6000, pricePerM2: 3.00, costBasis: 'perLinearMeter', density: 7850, color: '#585858' },
  { id: 'steel-angle-30-3', name: 'Steel Angle 30x30x3mm', category: 'metal', thickness: 3, defaultWidth: 30, defaultHeight: 6000, pricePerM2: 3.60, costBasis: 'perLinearMeter', density: 7850, color: '#565656' },
  { id: 'steel-angle-40-3', name: 'Steel Angle 40x40x3mm', category: 'metal', thickness: 3, defaultWidth: 40, defaultHeight: 6000, pricePerM2: 4.60, costBasis: 'perLinearMeter', density: 7850, color: '#545454' },
  { id: 'steel-angle-40-4', name: 'Steel Angle 40x40x4mm', category: 'metal', thickness: 4, defaultWidth: 40, defaultHeight: 6000, pricePerM2: 6.00, costBasis: 'perLinearMeter', density: 7850, color: '#525252' },
  { id: 'steel-angle-50-4', name: 'Steel Angle 50x50x4mm', category: 'metal', thickness: 4, defaultWidth: 50, defaultHeight: 6000, pricePerM2: 7.40, costBasis: 'perLinearMeter', density: 7850, color: '#505050' },
  { id: 'steel-angle-50-5', name: 'Steel Angle 50x50x5mm', category: 'metal', thickness: 5, defaultWidth: 50, defaultHeight: 6000, pricePerM2: 9.20, costBasis: 'perLinearMeter', density: 7850, color: '#4E4E4E' },
  { id: 'steel-angle-60-5', name: 'Steel Angle 60x60x5mm', category: 'metal', thickness: 5, defaultWidth: 60, defaultHeight: 6000, pricePerM2: 11.00, costBasis: 'perLinearMeter', density: 7850, color: '#4C4C4C' },
  { id: 'steel-angle-75-6', name: 'Steel Angle 75x75x6mm', category: 'metal', thickness: 6, defaultWidth: 75, defaultHeight: 6000, pricePerM2: 16.00, costBasis: 'perLinearMeter', density: 7850, color: '#4A4A4A' },

  // --- Metal (Flat Bar) ---
  { id: 'steel-flat-20x3', name: 'Steel Flat Bar 20x3mm', category: 'metal', thickness: 3, defaultWidth: 20, defaultHeight: 6000, pricePerM2: 1.40, costBasis: 'perLinearMeter', density: 7850, color: '#767676' },
  { id: 'steel-flat-25x3', name: 'Steel Flat Bar 25x3mm', category: 'metal', thickness: 3, defaultWidth: 25, defaultHeight: 6000, pricePerM2: 1.80, costBasis: 'perLinearMeter', density: 7850, color: '#737373' },
  { id: 'steel-flat-30x3', name: 'Steel Flat Bar 30x3mm', category: 'metal', thickness: 3, defaultWidth: 30, defaultHeight: 6000, pricePerM2: 2.10, costBasis: 'perLinearMeter', density: 7850, color: '#707070' },
  { id: 'steel-flat-40x5', name: 'Steel Flat Bar 40x5mm', category: 'metal', thickness: 5, defaultWidth: 40, defaultHeight: 6000, pricePerM2: 4.60, costBasis: 'perLinearMeter', density: 7850, color: '#6D6D6D' },
  { id: 'steel-flat-50x5', name: 'Steel Flat Bar 50x5mm', category: 'metal', thickness: 5, defaultWidth: 50, defaultHeight: 6000, pricePerM2: 5.80, costBasis: 'perLinearMeter', density: 7850, color: '#6A6A6A' },

  // --- Metal (Aluminum Tubes & Profiles) ---
  { id: 'aluminum-sq-20-1.5', name: 'Aluminum SQ Tube 20x20x1.5mm', category: 'metal', thickness: 1.5, defaultWidth: 20, defaultHeight: 6000, pricePerM2: 3.40, costBasis: 'perLinearMeter', density: 2700, color: '#B2B2B2' },
  { id: 'aluminum-sq-25', name: 'Aluminum SQ Tube 25x25x1.5mm', category: 'metal', thickness: 1.5, defaultWidth: 25, defaultHeight: 6000, pricePerM2: 4.60, costBasis: 'perLinearMeter', density: 2700, color: '#AAAAAA' },
  { id: 'aluminum-sq-30-2', name: 'Aluminum SQ Tube 30x30x2mm', category: 'metal', thickness: 2, defaultWidth: 30, defaultHeight: 6000, pricePerM2: 6.40, costBasis: 'perLinearMeter', density: 2700, color: '#A6A6A6' },
  { id: 'aluminum-sq-40-2', name: 'Aluminum SQ Tube 40x40x2mm', category: 'metal', thickness: 2, defaultWidth: 40, defaultHeight: 6000, pricePerM2: 8.60, costBasis: 'perLinearMeter', density: 2700, color: '#A2A2A2' },
  { id: 'aluminum-sq-50-2', name: 'Aluminum SQ Tube 50x50x2mm', category: 'metal', thickness: 2, defaultWidth: 50, defaultHeight: 6000, pricePerM2: 10.80, costBasis: 'perLinearMeter', density: 2700, color: '#9E9E9E' },
  { id: 'aluminum-rd-20-1.5', name: 'Aluminum Round Tube 20mm x 1.5mm', category: 'metal', thickness: 1.5, defaultWidth: 20, defaultHeight: 6000, pricePerM2: 3.00, costBasis: 'perLinearMeter', density: 2700, color: '#B0B0B0' },
  { id: 'aluminum-rd-25', name: 'Aluminum Round Tube 25mm x 1.5mm', category: 'metal', thickness: 1.5, defaultWidth: 25, defaultHeight: 6000, pricePerM2: 4.20, costBasis: 'perLinearMeter', density: 2700, color: '#A5A5A5' },
  { id: 'aluminum-rd-30-2', name: 'Aluminum Round Tube 30mm x 2mm', category: 'metal', thickness: 2, defaultWidth: 30, defaultHeight: 6000, pricePerM2: 5.60, costBasis: 'perLinearMeter', density: 2700, color: '#A0A0A0' },
  { id: 'aluminum-rd-40-2', name: 'Aluminum Round Tube 40mm x 2mm', category: 'metal', thickness: 2, defaultWidth: 40, defaultHeight: 6000, pricePerM2: 7.40, costBasis: 'perLinearMeter', density: 2700, color: '#9B9B9B' },
  { id: 'aluminum-rd-50-2', name: 'Aluminum Round Tube 50mm x 2mm', category: 'metal', thickness: 2, defaultWidth: 50, defaultHeight: 6000, pricePerM2: 9.40, costBasis: 'perLinearMeter', density: 2700, color: '#969696' },
  { id: 'aluminum-angle-25-2', name: 'Aluminum Angle 25x25x2mm', category: 'metal', thickness: 2, defaultWidth: 25, defaultHeight: 6000, pricePerM2: 3.80, costBasis: 'perLinearMeter', density: 2700, color: '#ABABAB' },
  { id: 'aluminum-angle-40-3', name: 'Aluminum Angle 40x40x3mm', category: 'metal', thickness: 3, defaultWidth: 40, defaultHeight: 6000, pricePerM2: 7.20, costBasis: 'perLinearMeter', density: 2700, color: '#A3A3A3' },

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

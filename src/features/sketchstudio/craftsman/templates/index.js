/**
 * Template registry for Craftsman Studio.
 * Each template is a workspace snapshot that can be loaded directly.
 */

const templates = [
  {
    id: 'bookshelf',
    name: 'Simple Bookshelf',
    description: '3 shelves, 2 sides, back panel. A great first project.',
    difficulty: 'beginner',
    estimatedTime: '4 hours',
    materials: ['18mm Birch Plywood'],
    load: () => import('./bookshelf.json'),
  },
  {
    id: 'workbench',
    name: 'Heavy-Duty Workbench',
    description: 'Sturdy top, legs, and stretchers. Built to last.',
    difficulty: 'intermediate',
    estimatedTime: '8 hours',
    materials: ['45x95mm Pine', '18mm Birch Plywood'],
    load: () => import('./workbench.json'),
  },
  {
    id: 'storageBox',
    name: 'Dovetail Storage Box',
    description: 'Classic box with finger joints. Perfect for learning joinery.',
    difficulty: 'beginner',
    estimatedTime: '2 hours',
    materials: ['12mm Birch Plywood'],
    load: () => import('./storageBox.json'),
  },
  {
    id: 'shelvingUnit',
    name: 'Modular Shelving Unit',
    description: 'Adjustable shelves with dado joints. Scales to any height.',
    difficulty: 'intermediate',
    estimatedTime: '6 hours',
    materials: ['18mm Birch Plywood', '6mm MDF'],
    load: () => import('./shelvingUnit.json'),
  },
  {
    id: 'cuttingBoard',
    name: 'Edge-Grain Cutting Board',
    description: 'Simple butcher-block style board. Great CNC project.',
    difficulty: 'beginner',
    estimatedTime: '2 hours',
    materials: ['20x95mm Oak'],
    load: () => import('./cuttingBoard.json'),
  },
  {
    id: 'plantStand',
    name: 'Mid-Century Plant Stand',
    description: 'Angled legs, minimal shelf. Looks expensive, costs little.',
    difficulty: 'intermediate',
    estimatedTime: '3 hours',
    materials: ['20x45mm Pine', '12mm Birch Plywood'],
    load: () => import('./plantStand.json'),
  },
  {
    id: 'toolCart',
    name: 'Workshop Tool Cart',
    description: 'Rolling cart with shelves for workshop organization.',
    difficulty: 'intermediate',
    estimatedTime: '6 hours',
    materials: ['18mm Birch Plywood', '45x45mm Pine'],
    load: () => import('./toolCart.json'),
  },
  {
    id: 'cncTestSheet',
    name: 'CNC Nesting Test',
    description: 'Mixed shapes on a standard sheet. Verify your CNC workflow.',
    difficulty: 'beginner',
    estimatedTime: '1 hour',
    materials: ['3mm Birch Plywood'],
    load: () => import('./cncTestSheet.json'),
  },
];

export default templates;

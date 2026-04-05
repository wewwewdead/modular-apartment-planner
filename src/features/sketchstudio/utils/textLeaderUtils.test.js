import { describe, expect, it } from 'vitest';
import { getTextLeaderArrowSize } from './textLeaderUtils';

describe('textLeaderUtils', () => {
  it('increases arrowhead size for larger text labels', () => {
    const smallArrow = getTextLeaderArrowSize({ type: 'text', text: 'Desk', fontSize: 100 });
    const largeArrow = getTextLeaderArrowSize({ type: 'text', text: 'Desk', fontSize: 240 });

    expect(largeArrow).toBeGreaterThan(smallArrow);
    expect(largeArrow).toBeGreaterThan(18);
  });
});

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ApartmentDesignOverlay from './ApartmentDesignOverlay';

describe('ApartmentDesignOverlay', () => {
  it('shows configured clearance probes only for a detailed apartment basis', () => {
    const floor = {
      id: 'floor_1',
      fixtures: [
        {
          id: 'bed_1',
          fixtureType: 'bed',
          x: 2000,
          y: 1500,
          width: 1400,
          depth: 2000,
          rotation: 0,
          generatedByApartmentDesignId: 'design_1',
        },
      ],
    };
    const html = renderToStaticMarkup(
      <svg>
        <ApartmentDesignOverlay
          apartmentDesign={{ status: 'detailed' }}
          profile={{ fixtureClearances: { bed: 450 } }}
          floor={floor}
        />
      </svg>,
    );
    expect(html).toContain('apartment-design-clearance');
    expect(html).toContain('fixture-clearance-probe');
    expect(html).toContain('bed_1');
    expect(
      renderToStaticMarkup(
        <svg>
          <ApartmentDesignOverlay apartmentDesign={{ status: 'not_detailed' }} profile={{}} floor={floor} />
        </svg>,
      ),
    ).not.toContain('fixture-clearance-probe');
  });
});

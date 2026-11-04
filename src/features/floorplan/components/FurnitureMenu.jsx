import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FIXTURE_LABELS, FIXTURE_TYPES, TOOLS } from '@/editor/tools';
import {
  BedIcon,
  FurnitureIcon,
  KitchenTopIcon,
  LavatoryIcon,
  PlantIcon,
  ShowerIcon,
  SofaIcon,
  TableIcon,
  ToiletIcon,
  TVIcon,
} from '@/ui/ToolbarIcons';
import Tooltip from './Tooltip';
import styles from './Toolbar.module.css';

// Three 76 px columns, two 4 px gaps, 6 px padding and a 1 px border each side.
const MENU_HALF_WIDTH = (3 * 76 + 2 * 4 + 2 * 6 + 2) / 2;

// Grouped the way a room is furnished: living, sleeping, wet, then the plant.
export const FURNITURE_ITEMS = [
  { fixtureType: FIXTURE_TYPES.SOFA, Icon: SofaIcon },
  { fixtureType: FIXTURE_TYPES.TABLE, Icon: TableIcon },
  { fixtureType: FIXTURE_TYPES.TV, Icon: TVIcon },
  { fixtureType: FIXTURE_TYPES.BED, Icon: BedIcon },
  { fixtureType: FIXTURE_TYPES.KITCHEN_TOP, Icon: KitchenTopIcon },
  { fixtureType: FIXTURE_TYPES.TOILET, Icon: ToiletIcon },
  { fixtureType: FIXTURE_TYPES.LAVATORY, Icon: LavatoryIcon },
  { fixtureType: FIXTURE_TYPES.SHOWER, Icon: ShowerIcon },
  { fixtureType: FIXTURE_TYPES.PLANT, Icon: PlantIcon },
];

/**
 * One Furniture button in place of a button per fixture type.
 *
 * The toolbar already runs well past the right edge of an ordinary window, and
 * nine fixture buttons were a fifth of its length. This puts all of them behind
 * one trigger that opens a small grid. The popover is portalled to the body and
 * positioned against the trigger, because the toolbar scrolls horizontally and
 * would clip anything that hung below it.
 *
 * The armed type stays visible without opening anything: the trigger shows the
 * pressed state while the Fixture tool is live, and its tooltip names the type.
 */
function FurnitureMenu({ activeTool, armedFixtureType, disabled, onArm }) {
  const [anchor, setAnchor] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const open = Boolean(anchor);
  const isActive = activeTool === TOOLS.FIXTURE;
  const armedLabel = isActive ? FIXTURE_LABELS[armedFixtureType] : null;

  const close = useCallback(() => setAnchor(null), []);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Centred under the trigger, but never hung off either edge of the window:
    // the toolbar scrolls, so the trigger itself can sit near (or past) one.
    const half = MENU_HALF_WIDTH + 8;
    const left = Math.min(Math.max(rect.left + rect.width / 2, half), Math.max(half, window.innerWidth - half));
    setAnchor({ left, top: rect.bottom + 8 });
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    };
    const onScrollOrResize = () => close();
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [close, open]);

  // Focus the armed item (or the first) when the grid opens, so arrow keys and
  // Enter work straight away.
  useEffect(() => {
    if (!open) return;
    const target = menuRef.current?.querySelector('[aria-checked="true"]') || menuRef.current?.querySelector('button');
    target?.focus();
  }, [open]);

  const handleMenuKeyDown = (event) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll('button') || [])];
    const index = items.indexOf(document.activeElement);
    const next = items[(index + keys[event.key] + items.length) % items.length];
    next?.focus();
  };

  return (
    <>
      <Tooltip label={armedLabel ? `Furniture · ${armedLabel}` : 'Furniture'} shortcut="F" suppressed={open}>
        <button
          ref={triggerRef}
          type="button"
          className={isActive ? styles.toolPaletteBtnActive : styles.toolPaletteBtn}
          onClick={toggle}
          disabled={disabled}
          aria-label="Furniture"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-pressed={isActive}
          data-armed-fixture={isActive ? armedFixtureType || undefined : undefined}
        >
          <FurnitureIcon className={styles.toolPaletteIcon} />
          <span className={styles.furnitureCaret} aria-hidden="true" />
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Furniture"
            className={styles.furnitureMenu}
            style={{ left: anchor.left, top: anchor.top }}
            onKeyDown={handleMenuKeyDown}
          >
            {FURNITURE_ITEMS.map(({ fixtureType, Icon }) => {
              const checked = isActive && armedFixtureType === fixtureType;
              return (
                <button
                  key={fixtureType}
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  className={checked ? styles.furnitureItemActive : styles.furnitureItem}
                  onClick={() => {
                    onArm(fixtureType);
                    close();
                  }}
                >
                  <Icon className={styles.furnitureItemIcon} />
                  <span className={styles.furnitureItemLabel}>{FIXTURE_LABELS[fixtureType]}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

export default memo(FurnitureMenu);

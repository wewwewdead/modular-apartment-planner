/**
 * One settled edit derives each whole-project model once (docs/perf-pass-3.md
 * D1.1).
 *
 * The coordination pass asks for the takeoff geometry, the feasibility
 * economics, the cost and documentation realizations and the professional
 * handoff many times over — sixteen takeoffs on the playground, over sixty with
 * two feasibility scenarios — and each is now memoised per project object
 * (`src/domain/projectMemo.js`). Run through the real reducer on the playground
 * project, given two priced scenarios. Every memoised model is checked against
 * a fresh derivation of a copy of the same project.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import demoData from '@/pages/playground-demo.json';
import { deserializeProject } from '@/persistence/deserialize';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import { QUANTITY_RATE_KEYS, deriveQuantityTakeoff } from '@/domain/quantityTakeoff';
import { deriveFeasibilityComparison, deriveFeasibilityEconomics } from '@/domain/feasibilityEconomics';
import { deriveCostRealization } from '@/domain/costRealization';
import { deriveDocumentationRealization } from '@/domain/documentationRealization';
import { deriveProfessionalHandoff, deriveRevisionEntityRecords } from '@/domain/professionalHandoff';
import { projectMemoComputeCount, resetProjectMemoComputeCounts } from '@/domain/projectMemo';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';

const MEMOS = [
  'deriveGeometry',
  'deriveFeasibilityEconomics',
  'deriveCostRealization',
  'deriveDocumentationRealization',
  'deriveProfessionalHandoff',
];

function command(state, payload) {
  const next = floorplanReducer(state, { type: 'EXECUTE_BUILDING_COMMAND', command: payload });
  expect(next.derived.lastCommand.ok, next.derived.lastCommand.error?.message).toBe(true);
  return next;
}

function rates(multiplier) {
  return Object.fromEntries(
    QUANTITY_RATE_KEYS.map((rateKey, index) => [
      rateKey,
      { material: Math.round((1200 + index * 110) * multiplier), labor: 450 + index * 35, equipment: 100 },
    ]),
  );
}

/** The playground, priced two ways, with two feasibility scenarios. */
function pricedState() {
  let state = initializeFloorplanState(deserializeProject(JSON.parse(JSON.stringify(demoData))).project);
  for (const [profileId, multiplier] of [
    ['memo_prices_a', 1],
    ['memo_prices_b', 0.9],
  ]) {
    state = command(state, {
      type: BUILDING_COMMANDS.CONFIGURE_PRICE_PROFILE,
      profileId,
      name: profileId,
      region: 'Region IV-A',
      locality: 'Locality',
      sourceLabel: 'Supplier canvass',
      sourceDate: '2026-08-01',
      currency: 'PHP',
      rates: rates(multiplier),
    });
  }
  for (const [scenarioId, priceProfileId, setActive] of [
    ['memo_scenario_a', 'memo_prices_a', true],
    ['memo_scenario_b', 'memo_prices_b', false],
  ]) {
    state = command(state, {
      type: BUILDING_COMMANDS.CONFIGURE_FEASIBILITY_SCENARIO,
      scenarioId,
      name: scenarioId,
      priceProfileId,
      contingencyPercent: 10,
      professionalFeesPercent: 7,
      permitAllowance: 100_000,
      otherAllowance: 0,
      monthlyGrossRent: 80_000,
      vacancyPercent: 8,
      operatingExpensePercent: 22,
      setActive,
    });
  }
  return state;
}

function wallEdit(state, height) {
  const floor = state.project.floors.find((entry) => (entry.walls || []).length);
  return { type: 'WALL_UPDATE', floorId: floor.id, wall: { id: floor.walls[0].id, height } };
}

/** The same project as a new object graph: nothing a memo has seen. */
function freshCopy(project) {
  return JSON.parse(JSON.stringify(project));
}

function expectMemoisedModelsFresh(state) {
  const fresh = freshCopy(state.project);
  expect(state.derived.quantityTakeoff).toEqual(deriveQuantityTakeoff(fresh));
  expect(state.derived.feasibilityEconomics).toEqual(deriveFeasibilityEconomics(fresh));
  expect(state.derived.feasibilityComparison).toEqual(deriveFeasibilityComparison(fresh));
  expect(state.derived.costRealization).toEqual(deriveCostRealization(fresh));
  expect(state.derived.documentationRealization).toEqual(deriveDocumentationRealization(fresh));
  expect(state.derived.professionalHandoff).toEqual(deriveProfessionalHandoff(fresh));
  for (const scenarioId of ['memo_scenario_a', 'memo_scenario_b']) {
    expect(deriveFeasibilityEconomics(state.project, scenarioId)).toEqual(
      deriveFeasibilityEconomics(fresh, scenarioId),
    );
  }
  expect(deriveRevisionEntityRecords(state.project)).toEqual(deriveRevisionEntityRecords(fresh));
}

describe('the coordination pass of one settled edit', () => {
  beforeEach(() => resetProjectMemoComputeCounts());

  it('derives each memoised model once (the economics once per scenario, plus the default ask)', () => {
    const state = pricedState();
    expect(state.project.building.quantityProfile.scenarios).toHaveLength(2);
    resetProjectMemoComputeCounts();

    const next = floorplanReducer(state, wallEdit(state, 2900));
    expect(next.project).not.toBe(state.project);

    expect(projectMemoComputeCount('deriveGeometry')).toBe(1);
    expect(projectMemoComputeCount('deriveCostRealization')).toBe(1);
    expect(projectMemoComputeCount('deriveDocumentationRealization')).toBe(1);
    expect(projectMemoComputeCount('deriveProfessionalHandoff')).toBe(1);
    // null (the active scenario, as the store asks) and each scenario by id.
    expect(projectMemoComputeCount('deriveFeasibilityEconomics')).toBe(3);
  });

  it('a mid-drag frame derives none of them, and the release derives each once', () => {
    let state = floorplanReducer(pricedState(), { type: 'BEGIN_DRAG_GESTURE' });
    resetProjectMemoComputeCounts();
    for (let frame = 1; frame <= 5; frame += 1) state = floorplanReducer(state, wallEdit(state, 2900 - frame));
    for (const name of MEMOS) expect(projectMemoComputeCount(name), name).toBe(0);
    floorplanReducer(state, { type: 'END_DRAG_GESTURE' });
    expect(projectMemoComputeCount('deriveGeometry')).toBe(1);
    expect(projectMemoComputeCount('deriveCostRealization')).toBe(1);
  });

  it('hands the store the same answers a fresh derivation gives, edit after edit', () => {
    let state = pricedState();
    expectMemoisedModelsFresh(state);
    state = floorplanReducer(state, wallEdit(state, 2850));
    expectMemoisedModelsFresh(state);
    const floor = state.project.floors.find((entry) => (entry.fixtures || []).length);
    state = floorplanReducer(state, {
      type: 'FIXTURE_UPDATE',
      floorId: floor.id,
      fixture: { id: floor.fixtures[0].id, x: floor.fixtures[0].x + 300 },
    });
    expectMemoisedModelsFresh(state);
    state = command(state, {
      type: BUILDING_COMMANDS.SET_ACTIVE_FEASIBILITY_SCENARIO,
      scenarioId: 'memo_scenario_b',
    });
    expectMemoisedModelsFresh(state);
    state = floorplanReducer(state, { type: 'UNDO' });
    expectMemoisedModelsFresh(state);
  });
});

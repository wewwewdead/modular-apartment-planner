/* @vitest-environment jsdom */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject } from '@/domain/models';
import { BUILDING_COMMANDS, executeBuildingCommand } from '@/domain/buildingCommands';
import { createSunStudyState } from '@/analysis/sunStudyState';
import SunStudyPanel from './SunStudyPanel';

const MANILA = { latitude: 14.5995, longitude: 120.9842, timeZone: 'Asia/Manila' };

function locatedProject() {
  const result = executeBuildingCommand(createProject('Sun'), {
    type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION,
    ...MANILA,
  });
  return result.project;
}

/*
  The panel with the store's two halves around it, as the sidebar wires it: a
  command runs against the project and answers through `lastCommand` the way
  the floorplan reducer records it, and a patch lands in the sun study.
*/
function Harness({ patches }) {
  const [store, setStore] = useState(() => ({ project: locatedProject(), lastCommand: null, before: null }));
  const [sunStudy, setSunStudy] = useState(() => ({ ...createSunStudyState(), enabled: true }));
  // Undo as the store does it: the project goes back, the command record stays.
  const undo = () => setStore((current) => ({ ...current, project: current.before, before: null }));
  return (
    <>
      <button type="button" onClick={undo}>
        Undo (test)
      </button>
      <SunStudyPanel
        project={store.project}
        sunStudy={sunStudy}
        lastCommand={store.lastCommand}
        onExecuteCommand={(command) =>
          setStore((current) => {
            const result = executeBuildingCommand(current.project, command);
            return result.ok
              ? {
                  project: result.project,
                  lastCommand: { ok: true, commandType: result.commandType },
                  before: current.project,
                }
              : {
                  ...current,
                  lastCommand: { ok: false, commandType: result.commandType, error: result.error },
                };
          })
        }
        onPatch={(patch) => {
          patches.push(patch);
          setSunStudy((current) => ({ ...current, ...patch }));
        }}
        onToggle={() => {}}
      />
    </>
  );
}

afterEach(cleanup);

function openMaskForm() {
  const patches = [];
  render(<Harness patches={patches} />);
  fireEvent.click(screen.getByRole('button', { name: /Accuracy/ }));
  return patches;
}

function typeMask(name, points) {
  fireEvent.change(screen.getByPlaceholderText('North neighbor garden'), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText(/0,-20000/), { target: { value: points } });
  fireEvent.click(screen.getByRole('button', { name: 'Add assessment mask' }));
}

const BOW_TIE = '0,0\n10000,10000\n10000,0\n0,10000';
const SQUARE = '0,-20000\n10000,-20000\n10000,-10000\n0,-10000';

describe('adding an assessment mask', () => {
  it('keeps what was typed, and the mask choice, when the command is rejected', () => {
    const patches = openMaskForm();
    typeMask('Crossed garden', BOW_TIE);

    expect(patches).toEqual([]);
    expect(screen.getByPlaceholderText('North neighbor garden').value).toBe('Crossed garden');
    expect(screen.getByPlaceholderText(/0,-20000/).value).toBe(BOW_TIE);
    // The reason sits with the form's other errors, under the Add button.
    const reason = screen.getByText('Assessment target must be a simple non-zero-area polygon.');
    expect(reason.closest('form')).toBe(screen.getByRole('button', { name: 'Add assessment mask' }).closest('form'));
    expect(screen.getByRole('combobox', { name: 'Assessment mask' }).value).toBe('property');
  });

  it('adopts the mask and clears the form once the command is accepted', () => {
    const patches = openMaskForm();
    typeMask('North garden', SQUARE);

    expect(patches).toHaveLength(1);
    const option = screen.getByRole('option', { name: /North garden/ });
    expect(patches[0]).toEqual({ targetId: option.value });
    expect(screen.getByRole('combobox', { name: 'Assessment mask' }).value).toBe(option.value);
    expect(screen.getByPlaceholderText('North neighbor garden').value).toBe('');
    expect(screen.getByPlaceholderText(/0,-20000/).value).toBe('');
  });

  it('can try again after a rejection, and adopts only the mask that landed', () => {
    const patches = openMaskForm();
    typeMask('Garden', BOW_TIE);
    fireEvent.change(screen.getByPlaceholderText(/0,-20000/), { target: { value: SQUARE } });
    fireEvent.click(screen.getByRole('button', { name: 'Add assessment mask' }));

    const option = screen.getByRole('option', { name: /Garden/ });
    expect(patches).toEqual([{ targetId: option.value }]);
  });
});

describe('the location editor', () => {
  const formIsOpen = () => screen.queryByRole('button', { name: 'Save' }) !== null;

  function openEditor() {
    render(<Harness patches={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(formIsOpen()).toBe(true);
  }

  it('closes once a save lands, even one that changed nothing it is keyed on', () => {
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(formIsOpen()).toBe(false);
  });

  it('stays open, with the reason, when the save is rejected', () => {
    openEditor();
    fireEvent.change(screen.getByPlaceholderText('14.5995'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(formIsOpen()).toBe(true);
    expect(screen.getByText('Latitude must be between -90 and 90 degrees.')).toBeTruthy();
  });

  it('does not open itself again when an undo puts the old location back', () => {
    openEditor();
    fireEvent.change(screen.getByPlaceholderText('14.5995'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(formIsOpen()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Undo (test)' }));
    expect(formIsOpen()).toBe(false);
  });
});

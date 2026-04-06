import butt from './types/butt';
import dado from './types/dado';
import rabbet from './types/rabbet';
import mortise_tenon from './types/mortise_tenon';
import dowel from './types/dowel';
import pocket_screw from './types/pocket_screw';
import tab_slot from './types/tab_slot';

const JOINT_REGISTRY = Object.freeze({
  butt,
  dado,
  rabbet,
  mortise_tenon,
  dowel,
  pocket_screw,
  tab_slot,
});

export function getJointTypeEntry(type) {
  return JOINT_REGISTRY[type] || JOINT_REGISTRY.butt;
}

export function getAllJointTypes() {
  return Object.values(JOINT_REGISTRY);
}

import type { EngineProfile } from '../types';
import { vw19TdiPd } from './diesel/vw19tdi-pd';

/** Master catalog of available engine profiles */
export const PROFILE_CATALOG: EngineProfile[] = [
  vw19TdiPd,
  // Future:
  // vw19TdiVe,
  // bmwM47,
  // ...
];

export function getProfileById(id: string): EngineProfile | undefined {
  return PROFILE_CATALOG.find((p) => p.id === id);
}

export function getDefaultProfile(): EngineProfile {
  return vw19TdiPd;
}

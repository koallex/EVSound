/** Core shared types for EVoice */

export type EngineState = 'OFF' | 'STARTING' | 'IDLE' | 'RUNNING' | 'STOPPING';

export type TransmissionMode = 'auto' | 'sport' | 'manual';

export type SpeedUnit = 'kmh' | 'mph';

export type Theme = 'light' | 'dark' | 'auto';

export interface EngineProfile {
  id: string;
  name: string;
  shortName: string;
  group: 'classic-diesel' | 'city-daily' | 'retro-future';
  description: string;
  /** Technical source note */
  sourceNote: string;
  cylinders: number;
  configuration: 'inline' | 'v' | 'boxer' | 'other';
  displacementLiters: number;
  maxPowerHp: number;
  maxTorqueNm: number;
  idleRpm: number;
  redlineRpm: number;
  /** Firing order or interval factor for diesel pulses */
  firingIntervalFactor: number;
  hasTurbo: boolean;
  /** Gear ratios (1st to top). Index 0 = 1st gear */
  gearRatios: number[];
  finalDrive: number;
  /** Tire radius in meters (approx) */
  wheelRadiusM: number;
  /** Audio model parameters */
  audio: {
    baseFrequency: number;
    combustionGain: number;
    mechanicalGain: number;
    intakeGain: number;
    turboGain: number;
    exhaustLowGain: number;
    exhaustHighGain: number;
    turboSpoolTime: number; // seconds
    dieselKnockIntensity: number;
  };
}

export interface VehicleState {
  engineState: EngineState;
  rpm: number;
  speedKmh: number;
  gear: number; // 0 = N/P, 1..n
  load: number; // 0..1
  throttle: number; // 0..1
  boost: number; // 0..1 turbo
  transmissionMode: TransmissionMode;
  isShifting: boolean;
}

export interface SpeedSource {
  type: 'gps' | 'simulation' | 'none';
  speedKmh: number;
  accuracy?: number;
  timestamp: number;
  signalQuality: 'good' | 'poor' | 'lost' | 'unavailable';
}

export interface AppSettings {
  profileId: string;
  speedUnit: SpeedUnit;
  theme: Theme;
  masterVolume: number;
  effectsIntensity: number;
  transmissionMode: TransmissionMode;
  simulationMode: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  profileId: 'vw-19-tdi-pd',
  speedUnit: 'kmh',
  theme: 'dark',
  masterVolume: 0.7,
  effectsIntensity: 0.8,
  transmissionMode: 'auto',
  simulationMode: false,
};

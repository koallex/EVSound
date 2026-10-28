import type { EngineProfile } from '../../types';

/**
 * Volkswagen 1.9 TDI PD (Pumpe-Düse)
 * Acoustic model: noise-based combustion bursts + mechanical texture + air-noise turbo.
 * Not a pitched oscillator.
 */
export const vw19TdiPd: EngineProfile = {
  id: 'vw-19-tdi-pd',
  name: 'Volkswagen 1.9 TDI PD',
  shortName: '1.9 TDI PD',
  group: 'classic-diesel',
  description:
    'Классический европейский турбодизель с насос-форсунками. Характерный механический рокот, сильный низкий крутящий момент и свист турбины под нагрузкой.',
  sourceNote:
    'Технические данные: публичные спецификации VW 1.9 TDI PD. Акустическая модель — процедурная, noise-based.',
  cylinders: 4,
  configuration: 'inline',
  displacementLiters: 1.9,
  maxPowerHp: 130,
  maxTorqueNm: 310,
  idleRpm: 850,
  redlineRpm: 4800,
  firingIntervalFactor: 1.0,
  hasTurbo: true,
  gearRatios: [3.78, 2.12, 1.36, 0.97, 0.76],
  finalDrive: 3.39,
  wheelRadiusM: 0.31,
  audio: {
    baseFrequency: 24,
    combustionGain: 0.78,
    mechanicalGain: 0.48,
    intakeGain: 0.2,
    turboGain: 0.55,
    exhaustLowGain: 0.7,
    exhaustHighGain: 0.25,
    turboSpoolTime: 1.4,
    dieselKnockIntensity: 0.8,
  },
};

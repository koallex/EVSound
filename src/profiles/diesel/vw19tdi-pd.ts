import type { EngineProfile } from '../../types';

/**
 * Volkswagen 1.9 TDI PD (Pumpe-Düse)
 * Typical power range 100–150 hp (e.g. 115 hp AJM / 130 hp ASZ / 150 hp BKD variants).
 * Source of technical data: public VW service literature, common knowledge of PD engines
 * (idle ~800–900 rpm, redline ~4500–5000 rpm, strong low-end torque, characteristic PD clatter).
 * Acoustic model is an approximation for educational / entertainment purposes.
 * Degree of acoustic fidelity: medium-high (procedural, tuned for character).
 */
export const vw19TdiPd: EngineProfile = {
  id: 'vw-19-tdi-pd',
  name: 'Volkswagen 1.9 TDI PD',
  shortName: '1.9 TDI PD',
  group: 'classic-diesel',
  description:
    'Классический европейский турбодизель с насос-форсунками. Характерный механический рокот, сильный низкий крутящий момент и свист турбины под нагрузкой.',
  sourceNote:
    'Технические данные: публичные спецификации VW 1.9 TDI PD (AJM/ASZ/AVF/BKD и аналоги). Акустическая модель — процедурная аппроксимация.',
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
    baseFrequency: 26,
    combustionGain: 0.62,
    mechanicalGain: 0.40,
    intakeGain: 0.22,
    turboGain: 0.45,
    exhaustLowGain: 0.72,
    exhaustHighGain: 0.28,
    turboSpoolTime: 1.35,
    dieselKnockIntensity: 0.72,
  },
};

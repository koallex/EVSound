import type { EngineProfile, EngineState, TransmissionMode, VehicleState } from '../types';

/**
 * Core vehicle / engine / gearbox simulation.
 * Pure logic, no audio or DOM.
 */
export class VehicleModel {
  private profile: EngineProfile;
  private state: VehicleState;
  private targetSpeedKmh = 0;
  private simulationThrottle = 0;
  private lastUpdateMs = 0;

  constructor(profile: EngineProfile) {
    this.profile = profile;
    this.state = {
      engineState: 'OFF',
      rpm: 0,
      speedKmh: 0,
      gear: 0,
      load: 0,
      throttle: 0,
      boost: 0,
      transmissionMode: 'auto',
      isShifting: false,
    };
  }

  setProfile(profile: EngineProfile) {
    this.profile = profile;
    // Keep current state but clamp rpm
    this.state.rpm = Math.min(this.state.rpm, profile.redlineRpm);
  }

  getState(): Readonly<VehicleState> {
    return { ...this.state };
  }

  getProfile(): EngineProfile {
    return this.profile;
  }

  /** External speed input (from GPS or simulation) */
  setTargetSpeed(speedKmh: number) {
    this.targetSpeedKmh = Math.max(0, speedKmh);
  }

  /** For simulation mode: 0..1 */
  setSimulationThrottle(t: number) {
    this.simulationThrottle = Math.max(0, Math.min(1, t));
  }

  setTransmissionMode(mode: TransmissionMode) {
    this.state.transmissionMode = mode;
  }

  start() {
    if (this.state.engineState === 'OFF' || this.state.engineState === 'STOPPING') {
      this.state.engineState = 'STARTING';
      this.state.rpm = 200;
    }
  }

  stop() {
    if (this.state.engineState !== 'OFF') {
      this.state.engineState = 'STOPPING';
    }
  }

  /**
   * Advance simulation by dt seconds.
   * Call from requestAnimationFrame or fixed timer (~60 Hz is fine).
   */
  update(dt: number) {
    if (dt <= 0 || dt > 0.1) dt = 0.016; // clamp

    const p = this.profile;
    let { engineState, rpm, speedKmh, gear, load, throttle, boost } = this.state;

    // --- Engine state machine ---
    if (engineState === 'STARTING') {
      rpm += 1800 * dt; // cranking ramp
      if (rpm >= p.idleRpm * 0.95) {
        engineState = 'IDLE';
        rpm = p.idleRpm;
      }
    } else if (engineState === 'STOPPING') {
      rpm *= Math.pow(0.15, dt); // fast decay
      if (rpm < 50) {
        engineState = 'OFF';
        rpm = 0;
        gear = 0;
        load = 0;
        throttle = 0;
        boost = 0;
      }
    } else if (engineState === 'OFF') {
      rpm = 0;
      // stay off
    } else {
      // IDLE or RUNNING
      // Speed tracking
      const speedError = this.targetSpeedKmh - speedKmh;
      // Simple inertia
      const accel = Math.max(-8, Math.min(6, speedError * 1.8 + this.simulationThrottle * 4));
      speedKmh = Math.max(0, speedKmh + accel * dt * 3.6); // rough m/s² → km/h

      // Throttle estimate from acceleration demand + simulation
      const demandedThrottle = Math.max(
        0,
        Math.min(1, this.simulationThrottle * 0.7 + Math.max(0, speedError) * 0.08 + (speedKmh > 5 ? 0.15 : 0))
      );
      throttle += (demandedThrottle - throttle) * Math.min(1, dt * 4);

      // Gear selection (simple auto)
      if (!this.state.isShifting) {
        const desiredGear = this.selectGear(speedKmh, rpm, throttle);
        if (desiredGear !== gear && desiredGear > 0) {
          this.state.isShifting = true;
          // brief load drop
          setTimeout(() => {
            this.state.gear = desiredGear;
            this.state.isShifting = false;
          }, 180);
        }
      }

      if (gear < 1 && speedKmh > 3) gear = 1;
      if (speedKmh < 1 && throttle < 0.05) gear = 0;

      // RPM from speed + gear
      if (gear >= 1 && gear <= p.gearRatios.length) {
        const ratio = p.gearRatios[gear - 1] * p.finalDrive;
        const wheelRps = (speedKmh / 3.6) / (2 * Math.PI * p.wheelRadiusM);
        const targetRpm = wheelRps * ratio * 60;
        // Smooth + load influence
        rpm += (targetRpm - rpm) * Math.min(1, dt * 6);
        if (this.state.isShifting) {
          rpm *= 0.92; // momentary drop
        }
      } else {
        // idle
        const idleTarget = p.idleRpm + throttle * 400;
        rpm += (idleTarget - rpm) * Math.min(1, dt * 3);
      }

      // Clamp
      rpm = Math.max(p.idleRpm * 0.7, Math.min(p.redlineRpm * 1.05, rpm));

      // Load (simplified)
      load = Math.max(0, Math.min(1, throttle * 0.85 + (rpm / p.redlineRpm) * 0.15));

      // Turbo spool
      if (p.hasTurbo) {
        const targetBoost = load > 0.25 ? Math.min(1, (load - 0.2) * 1.4) : 0;
        const spoolRate = 1 / p.audio.turboSpoolTime;
        if (targetBoost > boost) {
          boost += (targetBoost - boost) * Math.min(1, dt * spoolRate * 2.5);
        } else {
          boost += (targetBoost - boost) * Math.min(1, dt * spoolRate * 4);
        }
      } else {
        boost = 0;
      }

      engineState = speedKmh > 2 || throttle > 0.1 || rpm > p.idleRpm + 150 ? 'RUNNING' : 'IDLE';
    }

    this.state = {
      ...this.state,
      engineState,
      rpm,
      speedKmh,
      gear,
      load,
      throttle,
      boost,
    };
  }

  private selectGear(speedKmh: number, rpm: number, throttle: number): number {
    const p = this.profile;
    const mode = this.state.transmissionMode;
    const shiftUpRpm = mode === 'sport' ? p.redlineRpm * 0.88 : p.redlineRpm * 0.72;
    const shiftDownRpm = mode === 'sport' ? p.idleRpm * 1.6 : p.idleRpm * 1.9;

    let gear = this.state.gear;
    if (gear < 1) return speedKmh > 5 ? 1 : 0;

    if (rpm > shiftUpRpm && gear < p.gearRatios.length && throttle > 0.2) {
      return gear + 1;
    }
    if (rpm < shiftDownRpm && gear > 1) {
      return gear - 1;
    }
    // Speed-based fallback for low throttle
    if (throttle < 0.15) {
      const approxGear = this.speedToGear(speedKmh);
      if (Math.abs(approxGear - gear) > 1) return approxGear;
    }
    return gear;
  }

  private speedToGear(speedKmh: number): number {
    // Very rough
    if (speedKmh < 15) return 1;
    if (speedKmh < 35) return 2;
    if (speedKmh < 60) return 3;
    if (speedKmh < 90) return 4;
    return 5;
  }
}

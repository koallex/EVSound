/**
 * EVoice AudioWorkletProcessor — VW 1.9 TDI PD oriented
 * Multi-layer procedural diesel synthesis with smooth parameter interpolation.
 */
class EngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Raw targets (from main thread)
    this.rpm = 850;
    this.load = 0;
    this.boost = 0;
    this.throttle = 0;
    this.engineState = 'OFF';

    // Smoothed values (critical for no zipper / clicks)
    this.sRpm = 850;
    this.sLoad = 0;
    this.sBoost = 0;
    this.sThrottle = 0;
    this.sGain = 0;
    this.targetGain = 0;

    // Profile
    this.cylinders = 4;
    this.idleRpm = 850;
    this.redlineRpm = 4800;
    this.combustionGain = 0.6;
    this.mechanicalGain = 0.38;
    this.turboGain = 0.42;
    this.dieselKnock = 0.7;

    // Phases
    this.combustionPhase = 0;
    this.cyclePhase = 0;       // full engine cycle
    this.turboPhase = 0;
    this.mechPhase = 0;

    // For overrun / decel effects
    this.prevThrottle = 0;
    this.overrunEnv = 0;

    // Simple one-pole filters state
    this.lpState = 0;
    this.hpState = 0;

    // Noise seed
    this.noise = 0;

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type !== 'params') return;

      if (d.rpm != null) this.rpm = d.rpm;
      if (d.load != null) this.load = d.load;
      if (d.boost != null) this.boost = d.boost;
      if (d.throttle != null) this.throttle = d.throttle;
      if (d.engineState != null) this.engineState = d.engineState;

      if (d.profile) {
        const p = d.profile;
        if (p.cylinders != null) this.cylinders = p.cylinders;
        if (p.idleRpm != null) this.idleRpm = p.idleRpm;
        if (p.redlineRpm != null) this.redlineRpm = p.redlineRpm;
        if (p.combustionGain != null) this.combustionGain = p.combustionGain;
        if (p.mechanicalGain != null) this.mechanicalGain = p.mechanicalGain;
        if (p.turboGain != null) this.turboGain = p.turboGain;
        if (p.dieselKnockIntensity != null) this.dieselKnock = p.dieselKnockIntensity;
      }
    };
  }

  // Cheap white noise
  rand() {
    this.noise = (this.noise * 16807 + 0) % 2147483647;
    return (this.noise / 2147483647) * 2 - 1;
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const ch = output[0];
    if (!ch) return true;

    const sr = sampleRate;
    const invSr = 1 / sr;
    const n = ch.length;

    // --- Parameter smoothing (block-rate + per-sample friendly) ---
    // Faster for rpm (needs to follow), slower for gain/boost
    const rpmCoef = 1 - Math.exp(-25 * invSr * 128);
    const loadCoef = 1 - Math.exp(-18 * invSr * 128);
    const boostCoef = 1 - Math.exp(-12 * invSr * 128);
    const thrCoef = 1 - Math.exp(-30 * invSr * 128);
    const gainCoef = 1 - Math.exp(-15 * invSr * 128);

    this.sRpm += (this.rpm - this.sRpm) * rpmCoef;
    this.sLoad += (this.load - this.sLoad) * loadCoef;
    this.sBoost += (this.boost - this.sBoost) * boostCoef;
    this.sThrottle += (this.throttle - this.sThrottle) * thrCoef;

    // Target gain by state
    let tg = 0;
    if (this.engineState === 'STARTING') tg = 0.38;
    else if (this.engineState === 'STOPPING') tg = 0.1;
    else if (this.engineState === 'OFF') tg = 0;
    else tg = 0.42 + this.sLoad * 0.48; // IDLE / RUNNING

    this.targetGain = tg;
    this.sGain += (this.targetGain - this.sGain) * gainCoef;

    if (this.sGain < 0.0008 && this.targetGain < 0.0008) {
      ch.fill(0);
      return true;
    }

    // Overrun detection (throttle drop)
    const thrDelta = this.sThrottle - this.prevThrottle;
    if (thrDelta < -0.08 && this.sRpm > this.idleRpm + 300) {
      this.overrunEnv = Math.min(1, this.overrunEnv + (-thrDelta) * 2.5);
    }
    this.overrunEnv *= 0.985; // decay
    this.prevThrottle = this.sThrottle;

    // Firing rate (4-stroke)
    const firesPerSec = (this.sRpm / 60) * (this.cylinders / 2);
    const phaseInc = firesPerSec * invSr;
    const cycleInc = (this.sRpm / 60) * invSr;

    // Turbo frequency (rises with boost + rpm)
    const turboFreq = 1400 + this.sBoost * 3800 + this.sRpm * 0.22;

    for (let i = 0; i < n; i++) {
      // Advance phases
      this.combustionPhase += phaseInc;
      if (this.combustionPhase >= 1) this.combustionPhase -= 1;

      this.cyclePhase += cycleInc;
      this.mechPhase += cycleInc;
      this.turboPhase += turboFreq * invSr;

      const pulse = this.combustionPhase;

      // ========== LAYER 1: Combustion (diesel character) ==========
      // Soft attack + body + metallic knock tail
      let comb = 0;
      if (pulse < 0.045) {
        // Sharp diesel ignition transient
        const t = pulse / 0.045;
        const env = Math.sin(t * Math.PI);
        comb = env * (0.7 + this.sLoad * 0.55);
        // High-frequency knock / clatter
        comb += this.rand() * this.dieselKnock * 0.35 * env * (0.6 + this.sLoad * 0.5);
      } else if (pulse < 0.18) {
        // Body of the combustion event
        const t = (pulse - 0.045) / 0.135;
        const env = Math.exp(-t * 3.2);
        comb = env * (0.35 + this.sLoad * 0.5);
        comb += this.rand() * 0.07 * env;
      } else if (pulse < 0.32) {
        // Short residual
        const t = (pulse - 0.18) / 0.14;
        comb = Math.exp(-t * 4.5) * 0.08 * (0.4 + this.sLoad);
      }

      // Slight cylinder imbalance (makes it more alive)
      const cylId = Math.floor(this.combustionPhase * this.cylinders) % this.cylinders;
      const imbalance = 1 + ((cylId % 2 === 0) ? 0.04 : -0.03);
      comb *= imbalance;

      // ========== LAYER 2: Mechanical rumble + low end ==========
      const mechBase =
        Math.sin(this.mechPhase * 2 * Math.PI) * 0.16 +
        Math.sin(this.mechPhase * 4 * Math.PI) * 0.09 +
        Math.sin(this.mechPhase * 6 * Math.PI) * 0.04;

      // Sub-rumble related to rpm
      const sub = Math.sin(this.cyclePhase * Math.PI) * 0.12 * (0.5 + this.sLoad * 0.5);

      const mechanical = (mechBase + sub) * this.mechanicalGain * (0.45 + this.sLoad * 0.55);

      // ========== LAYER 3: Turbo ==========
      let turbo = 0;
      if (this.sBoost > 0.03) {
        const tw = Math.sin(this.turboPhase * 2 * Math.PI);
        // Soft high-shelf character
        turbo = tw * this.sBoost * this.turboGain * 0.19 * (0.5 + this.sLoad * 0.5);
        // Air noise component
        turbo += this.rand() * this.sBoost * 0.035;
      }

      // ========== LAYER 4: Overrun / decel texture ==========
      let overrun = 0;
      if (this.overrunEnv > 0.02) {
        // Short crackles / pops on lift
        const crackle = (this.rand() > 0.92 ? this.rand() * 0.6 : 0);
        overrun = (crackle + this.rand() * 0.08) * this.overrunEnv * 0.45;
      }

      // ========== Mix ==========
      let sample =
        comb * this.combustionGain * 0.72 +
        mechanical +
        turbo +
        overrun;

      // Very light low-pass to tame harshness (one-pole)
      this.lpState += (sample - this.lpState) * 0.35;
      sample = this.lpState * 0.75 + sample * 0.25;

      // Soft saturation (prevents digital harshness & clipping)
      sample = Math.tanh(sample * 1.25) * this.sGain * 0.52;

      ch[i] = sample;
    }

    return true;
  }
}

registerProcessor('engine-processor', EngineProcessor);

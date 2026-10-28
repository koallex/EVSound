/**
 * AudioWorkletProcessor for EVoice engine synthesis.
 * Runs in the audio rendering thread for low-latency, glitch-free generation.
 *
 * Message protocol (from main thread):
 *   { type: 'params', rpm, load, boost, throttle, engineState, profileParams }
 */
// @ts-nocheck  // AudioWorklet global scope
class EngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rpm = 850;
    this.load = 0;
    this.boost = 0;
    this.throttle = 0;
    this.engineState = 'OFF';
    this.phase = 0;
    this.combustionPhase = 0;
    this.sampleRate = sampleRate;
    this.smoothedRpm = 850;
    this.smoothedLoad = 0;
    this.smoothedBoost = 0;
    this.gain = 0;
    this.targetGain = 0;

    // Profile defaults (overwritten by messages)
    this.cylinders = 4;
    this.idleRpm = 850;
    this.redlineRpm = 4800;
    this.baseFreq = 28;
    this.combustionGain = 0.55;
    this.mechanicalGain = 0.35;
    this.turboGain = 0.4;
    this.dieselKnock = 0.65;

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'params') {
        this.rpm = d.rpm ?? this.rpm;
        this.load = d.load ?? this.load;
        this.boost = d.boost ?? this.boost;
        this.throttle = d.throttle ?? this.throttle;
        this.engineState = d.engineState ?? this.engineState;
        if (d.profile) {
          const p = d.profile;
          this.cylinders = p.cylinders ?? 4;
          this.idleRpm = p.idleRpm ?? 850;
          this.redlineRpm = p.redlineRpm ?? 4800;
          this.baseFreq = p.baseFrequency ?? 28;
          this.combustionGain = p.combustionGain ?? 0.55;
          this.mechanicalGain = p.mechanicalGain ?? 0.35;
          this.turboGain = p.turboGain ?? 0.4;
          this.dieselKnock = p.dieselKnockIntensity ?? 0.65;
        }
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channel = output[0];
    if (!channel) return true;

    const sr = this.sampleRate;
    const invSr = 1 / sr;

    // Smooth parameters (critical for no clicks / zipper noise)
    const smoothFactor = 1 - Math.exp(-40 * invSr * 128); // ~per block
    this.smoothedRpm += (this.rpm - this.smoothedRpm) * 0.08;
    this.smoothedLoad += (this.load - this.smoothedLoad) * 0.06;
    this.smoothedBoost += (this.boost - this.smoothedBoost) * 0.04;

    // Target gain by state
    if (this.engineState === 'OFF') {
      this.targetGain = 0;
    } else if (this.engineState === 'STARTING') {
      this.targetGain = 0.35;
    } else if (this.engineState === 'STOPPING') {
      this.targetGain = 0.15;
    } else {
      this.targetGain = 0.55 + this.smoothedLoad * 0.35;
    }
    this.gain += (this.targetGain - this.gain) * 0.03;

    if (this.gain < 0.001 && this.targetGain < 0.001) {
      channel.fill(0);
      return true;
    }

    // Firing rate for 4-stroke: (rpm / 60) * (cylinders / 2)
    const firesPerSec = (this.smoothedRpm / 60) * (this.cylinders / 2);
    const phaseInc = firesPerSec / sr;

    for (let i = 0; i < channel.length; i++) {
      this.combustionPhase += phaseInc;
      if (this.combustionPhase >= 1) this.combustionPhase -= 1;

      // --- Layer 1: Combustion pulses (diesel-style) ---
      // Soft impulse + decaying noise burst shaped by load
      const pulsePos = this.combustionPhase;
      let combustion = 0;
      if (pulsePos < 0.08) {
        // Attack
        const t = pulsePos / 0.08;
        combustion = Math.sin(t * Math.PI) * (0.6 + this.smoothedLoad * 0.5);
        // Diesel knock / clatter component
        combustion += (Math.random() * 2 - 1) * this.dieselKnock * 0.25 * (1 - t);
      } else if (pulsePos < 0.25) {
        const t = (pulsePos - 0.08) / 0.17;
        combustion = Math.exp(-t * 4) * (0.3 + this.smoothedLoad * 0.4);
        combustion += (Math.random() * 2 - 1) * 0.08 * Math.exp(-t * 3);
      }

      // --- Layer 2: Mechanical / low rumble ---
      this.phase += (this.smoothedRpm / 60) * invSr;
      const mech =
        Math.sin(this.phase * 2 * Math.PI * 0.5) * 0.15 +
        Math.sin(this.phase * 2 * Math.PI * 1.0) * 0.1 +
        Math.sin(this.phase * 2 * Math.PI * 2.0) * 0.05;
      const rumble = mech * (0.4 + this.smoothedLoad * 0.5) * this.mechanicalGain;

      // --- Layer 3: Turbo whistle (high, load & boost dependent) ---
      let turbo = 0;
      if (this.smoothedBoost > 0.05) {
        const turboFreq = 1800 + this.smoothedBoost * 3200 + this.smoothedRpm * 0.15;
        const turboPhase = (this.phase * turboFreq) % 1;
        turbo =
          Math.sin(turboPhase * 2 * Math.PI) *
          this.smoothedBoost *
          this.turboGain *
          0.22 *
          (0.5 + this.smoothedLoad * 0.5);
        // slight noise
        turbo += (Math.random() * 2 - 1) * this.smoothedBoost * 0.03;
      }

      // --- Mix ---
      let sample =
        combustion * this.combustionGain * 0.7 +
        rumble +
        turbo;

      // Soft clip / tanh for warmth & safety
      sample = Math.tanh(sample * 1.4) * this.gain * 0.55;

      channel[i] = sample;
    }

    return true;
  }
}

registerProcessor('engine-processor', EngineProcessor);

/**
 * Standalone AudioWorkletProcessor (plain JS for reliable loading)
 */
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
    this.smoothedRpm = 850;
    this.smoothedLoad = 0;
    this.smoothedBoost = 0;
    this.gain = 0;
    this.targetGain = 0;
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
          if (p.baseFrequency != null) this.baseFreq = p.baseFrequency;
          if (p.combustionGain != null) this.combustionGain = p.combustionGain;
          if (p.mechanicalGain != null) this.mechanicalGain = p.mechanicalGain;
          if (p.turboGain != null) this.turboGain = p.turboGain;
          if (p.dieselKnockIntensity != null) this.dieselKnock = p.dieselKnockIntensity;
        }
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];
    if (!channel) return true;

    const sr = sampleRate;
    const invSr = 1 / sr;

    this.smoothedRpm += (this.rpm - this.smoothedRpm) * 0.08;
    this.smoothedLoad += (this.load - this.smoothedLoad) * 0.06;
    this.smoothedBoost += (this.boost - this.smoothedBoost) * 0.04;

    if (this.engineState === 'OFF') this.targetGain = 0;
    else if (this.engineState === 'STARTING') this.targetGain = 0.4;
    else if (this.engineState === 'STOPPING') this.targetGain = 0.12;
    else this.targetGain = 0.5 + this.smoothedLoad * 0.4;

    this.gain += (this.targetGain - this.gain) * 0.025;

    if (this.gain < 0.001 && this.targetGain < 0.001) {
      for (let i = 0; i < channel.length; i++) channel[i] = 0;
      return true;
    }

    const firesPerSec = (this.smoothedRpm / 60) * (this.cylinders / 2);
    const phaseInc = firesPerSec / sr;

    for (let i = 0; i < channel.length; i++) {
      this.combustionPhase += phaseInc;
      if (this.combustionPhase >= 1) this.combustionPhase -= 1;

      const pulsePos = this.combustionPhase;
      let combustion = 0;
      if (pulsePos < 0.07) {
        const t = pulsePos / 0.07;
        combustion = Math.sin(t * Math.PI) * (0.55 + this.smoothedLoad * 0.55);
        combustion += (Math.random() * 2 - 1) * this.dieselKnock * 0.28 * (1 - t);
      } else if (pulsePos < 0.22) {
        const t = (pulsePos - 0.07) / 0.15;
        combustion = Math.exp(-t * 3.8) * (0.28 + this.smoothedLoad * 0.45);
        combustion += (Math.random() * 2 - 1) * 0.07 * Math.exp(-t * 2.8);
      }

      this.phase += (this.smoothedRpm / 60) * invSr;
      const mech =
        Math.sin(this.phase * Math.PI) * 0.14 +
        Math.sin(this.phase * 2 * Math.PI) * 0.09 +
        Math.sin(this.phase * 4 * Math.PI) * 0.04;
      const rumble = mech * (0.35 + this.smoothedLoad * 0.55) * this.mechanicalGain;

      let turbo = 0;
      if (this.smoothedBoost > 0.04) {
        const turboFreq = 1600 + this.smoothedBoost * 3400 + this.smoothedRpm * 0.18;
        turbo =
          Math.sin(this.phase * turboFreq * 2 * Math.PI) *
          this.smoothedBoost *
          this.turboGain *
          0.2 *
          (0.45 + this.smoothedLoad * 0.55);
        turbo += (Math.random() * 2 - 1) * this.smoothedBoost * 0.025;
      }

      let sample = combustion * this.combustionGain * 0.75 + rumble + turbo;
      sample = Math.tanh(sample * 1.35) * this.gain * 0.5;
      channel[i] = sample;
    }
    return true;
  }
}

registerProcessor('engine-processor', EngineProcessor);

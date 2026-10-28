/**
 * EVoice AudioWorklet — VW 1.9 TDI PD
 * Goal: textured, irregular diesel character, not a pitched sine.
 * Layers: filtered noise combustion, mechanical clatter, intake, turbo (air noise + weak tone)
 */
class EngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.rpm = 850;
    this.load = 0;
    this.boost = 0;
    this.throttle = 0;
    this.engineState = 'OFF';

    this.sRpm = 850;
    this.sLoad = 0;
    this.sBoost = 0;
    this.sThrottle = 0;
    this.sGain = 0;
    this.targetGain = 0;

    this.cylinders = 4;
    this.idleRpm = 850;
    this.redlineRpm = 4800;
    this.combustionGain = 0.7;
    this.mechanicalGain = 0.45;
    this.turboGain = 0.5;
    this.dieselKnock = 0.75;

    this.firePhase = 0;
    this.slowPhase = 0;
    this.turboTonePhase = 0;

    this.prevThrottle = 0;
    this.overrunEnv = 0;

    // Filter states
    this.combLp = 0;
    this.combHp = 0;
    this.mechLp = 0;
    this.turboBp = 0;
    this.turboLp = 0;
    this.outLp = 0;

    // Noise
    this.nState = 1;

    // Short delay for slight body / cabin feel (very small)
    this.delayBuf = new Float32Array(64);
    this.delayIdx = 0;

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

  noise() {
    // xorshift-ish
    let x = this.nState | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.nState = x;
    return (x | 0) / 2147483648;
  }

  process(inputs, outputs) {
    const ch = outputs[0][0];
    if (!ch) return true;

    const sr = sampleRate;
    const invSr = 1 / sr;
    const n = ch.length;

    // Smooth params
    this.sRpm += (this.rpm - this.sRpm) * 0.12;
    this.sLoad += (this.load - this.sLoad) * 0.08;
    this.sBoost += (this.boost - this.sBoost) * 0.05;
    this.sThrottle += (this.throttle - this.sThrottle) * 0.15;

    let tg = 0;
    if (this.engineState === 'STARTING') tg = 0.4;
    else if (this.engineState === 'STOPPING') tg = 0.12;
    else if (this.engineState === 'OFF') tg = 0;
    else tg = 0.38 + this.sLoad * 0.55;
    this.targetGain = tg;
    this.sGain += (this.targetGain - this.sGain) * 0.04;

    if (this.sGain < 0.001 && this.targetGain < 0.001) {
      ch.fill(0);
      return true;
    }

    // Overrun
    const dThr = this.sThrottle - this.prevThrottle;
    if (dThr < -0.1 && this.sRpm > this.idleRpm + 400) {
      this.overrunEnv = Math.min(1, this.overrunEnv - dThr * 2.8);
    }
    this.overrunEnv *= 0.992;
    this.prevThrottle = this.sThrottle;

    // Firing rate
    const firesPerSec = (this.sRpm / 60) * (this.cylinders / 2);
    const fireInc = firesPerSec * invSr;
    const slowInc = (this.sRpm / 120) * invSr; // half-speed mechanical

    // Turbo centre frequency (not pure pitch track)
    const turboCentre = 2200 + this.sBoost * 2800 + Math.min(800, this.sRpm * 0.12);

    // Load-dependent brightness
    const bright = 0.35 + this.sLoad * 0.5;

    for (let i = 0; i < n; i++) {
      this.firePhase += fireInc;
      if (this.firePhase >= 1) this.firePhase -= 1;
      this.slowPhase += slowInc;

      const n1 = this.noise();
      const n2 = this.noise();

      // ----- 1. Combustion: filtered noise burst at each firing -----
      // Envelope: short, asymmetric, diesel-like
      let env = 0;
      const p = this.firePhase;
      if (p < 0.06) {
        env = Math.sin((p / 0.06) * Math.PI);           // attack
      } else if (p < 0.22) {
        env = Math.exp(-(p - 0.06) * 9);                 // decay
      }

      // Slight random amplitude jitter per cycle (irregularity)
      const jitter = 0.85 + (n2 * 0.15 + 0.5) * 0.3;

      // Band-limited noise through crude HP + LP
      let comb = n1;
      this.combHp += (comb - this.combHp) * 0.55;       // remove DC / very low
      comb = comb - this.combHp;
      this.combLp += (comb - this.combLp) * (0.25 + bright * 0.25);
      comb = this.combLp;

      // Add a bit of low thud (not a sine pitch)
      const thud = (p < 0.08 ? (1 - p / 0.08) : 0) * (0.4 + this.sLoad * 0.4);
      comb = comb * env * jitter * (0.7 + this.sLoad * 0.6) + n1 * thud * 0.25;

      // Knock / clatter emphasis on attack
      if (p < 0.05) {
        comb += n2 * this.dieselKnock * 0.4 * (1 - p / 0.05) * (0.5 + this.sLoad);
      }

      // ----- 2. Mechanical layer: irregular low texture -----
      // Not harmonic series — more like modulated noise + slow pulses
      let mech = n2;
      this.mechLp += (mech - this.mechLp) * 0.08;       // low-pass heavily
      mech = this.mechLp;

      // Slow amplitude modulation at engine speed (not pure tone)
      const mod = 0.55 + 0.45 * Math.sin(this.slowPhase * 2 * Math.PI);
      mech *= mod * (0.35 + this.sLoad * 0.5);

      // Occasional light tick
      if (p > 0.5 && p < 0.52) {
        mech += n1 * 0.08 * (0.3 + this.sLoad);
      }

      // ----- 3. Turbo: mostly air noise, weak tonal component -----
      let turbo = 0;
      if (this.sBoost > 0.04) {
        // Broadband air
        let air = n1;
        // Crude band-pass around turboCentre
        this.turboBp += (air - this.turboBp) * 0.4;
        air = air - this.turboBp;
        this.turboLp += (air - this.turboLp) * Math.min(0.5, turboCentre / sr * 8);
        air = this.turboLp;

        // Weak whistling component (not dominant)
        this.turboTonePhase += turboCentre * invSr;
        const tone = Math.sin(this.turboTonePhase * 2 * Math.PI) * 0.15;

        turbo = (air * 0.85 + tone * 0.15) * this.sBoost * this.turboGain * (0.4 + this.sLoad * 0.5);
      }

      // ----- 4. Overrun crackle -----
      let over = 0;
      if (this.overrunEnv > 0.03) {
        const pop = (n1 > 0.93) ? n2 * 0.7 : n1 * 0.05;
        over = pop * this.overrunEnv * 0.5;
      }

      // ----- Mix -----
      let s =
        comb * this.combustionGain * 0.8 +
        mech * this.mechanicalGain +
        turbo +
        over;

      // Tiny diffusion / body
      const d = this.delayBuf[this.delayIdx];
      this.delayBuf[this.delayIdx] = s * 0.3;
      this.delayIdx = (this.delayIdx + 1) % this.delayBuf.length;
      s += d * 0.25;

      // Soft output filter + saturation
      this.outLp += (s - this.outLp) * 0.4;
      s = this.outLp * 0.7 + s * 0.3;
      s = Math.tanh(s * 1.1) * this.sGain * 0.55;

      ch[i] = s;
    }

    return true;
  }
}

registerProcessor('engine-processor', EngineProcessor);

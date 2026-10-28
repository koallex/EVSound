/**
 * EVoice AudioWorklet — VW 1.9 TDI PD
 * Noise-based, non-tonal. Brighter mix, clearer knock, less muffling.
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
    this.combustionGain = 0.8;
    this.mechanicalGain = 0.42;
    this.turboGain = 0.5;
    this.dieselKnock = 0.82;

    this.firePhase = 0;
    this.slowPhase = 0;
    this.turboTonePhase = 0;

    this.prevThrottle = 0;
    this.overrunEnv = 0;

    // Filters — lighter than before
    this.combHp = 0;
    this.combBp = 0;
    this.mechLp = 0;
    this.turboHp = 0;
    this.turboBp = 0;
    this.outHp = 0;
    this.outLp = 0;

    this.nState = 1;
    this.delayBuf = new Float32Array(48);
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

    this.sRpm += (this.rpm - this.sRpm) * 0.14;
    this.sLoad += (this.load - this.sLoad) * 0.09;
    this.sBoost += (this.boost - this.sBoost) * 0.055;
    this.sThrottle += (this.throttle - this.sThrottle) * 0.16;

    let tg = 0;
    if (this.engineState === 'STARTING') tg = 0.42;
    else if (this.engineState === 'STOPPING') tg = 0.12;
    else if (this.engineState === 'OFF') tg = 0;
    else tg = 0.4 + this.sLoad * 0.52;
    this.targetGain = tg;
    this.sGain += (this.targetGain - this.sGain) * 0.045;

    if (this.sGain < 0.001 && this.targetGain < 0.001) {
      ch.fill(0);
      return true;
    }

    const dThr = this.sThrottle - this.prevThrottle;
    if (dThr < -0.1 && this.sRpm > this.idleRpm + 350) {
      this.overrunEnv = Math.min(1, this.overrunEnv - dThr * 3);
    }
    this.overrunEnv *= 0.991;
    this.prevThrottle = this.sThrottle;

    const firesPerSec = (this.sRpm / 60) * (this.cylinders / 2);
    const fireInc = firesPerSec * invSr;
    const slowInc = (this.sRpm / 110) * invSr;

    // Turbo band — higher, more present
    const turboCentre = 2800 + this.sBoost * 3200 + Math.min(900, this.sRpm * 0.15);
    const bright = 0.45 + this.sLoad * 0.45; // overall presence

    for (let i = 0; i < n; i++) {
      this.firePhase += fireInc;
      if (this.firePhase >= 1) this.firePhase -= 1;
      this.slowPhase += slowInc;

      const n1 = this.noise();
      const n2 = this.noise();
      const n3 = this.noise();

      const p = this.firePhase;

      // ===== Combustion envelope (short, punchy) =====
      let env = 0;
      if (p < 0.04) {
        env = Math.sin((p / 0.04) * Math.PI);          // fast attack
      } else if (p < 0.16) {
        env = Math.exp(-(p - 0.04) * 11);               // quick decay
      }

      // Amplitude irregularity
      const jitter = 0.8 + (n2 * 0.5 + 0.5) * 0.4;

      // --- Mid-focused noise (presence) ---
      let mid = n1;
      // High-pass to remove boom
      this.combHp += (mid - this.combHp) * 0.35;
      mid = mid - this.combHp;
      // Mild band emphasis
      this.combBp += (mid - this.combBp) * (0.45 + bright * 0.2);
      mid = mid * 0.4 + this.combBp * 0.6;

      // --- Low thud (short, not constant hum) ---
      const thudEnv = p < 0.07 ? (1 - p / 0.07) : 0;
      const thud = n3 * thudEnv * 0.35 * (0.5 + this.sLoad * 0.5);

      // --- Sharp knock / clatter on attack ---
      let knock = 0;
      if (p < 0.035) {
        knock = n2 * this.dieselKnock * 0.55 * (1 - p / 0.035) * (0.6 + this.sLoad * 0.5);
      }

      let comb = (mid * env * jitter * (0.75 + this.sLoad * 0.55) + thud + knock);

      // ===== Mechanical: brighter texture, not only sub =====
      let mech = n2 * 0.7 + n3 * 0.3;
      this.mechLp += (mech - this.mechLp) * 0.18; // less heavy than before
      mech = this.mechLp;
      const mod = 0.5 + 0.5 * Math.sin(this.slowPhase * 2 * Math.PI);
      mech *= mod * (0.3 + this.sLoad * 0.45);

      // Light metallic ticks
      if (p > 0.48 && p < 0.505) {
        mech += n1 * 0.12 * (0.4 + this.sLoad * 0.4);
      }

      // ===== Turbo: air + weak tone, more audible =====
      let turbo = 0;
      if (this.sBoost > 0.035) {
        let air = n1;
        this.turboHp += (air - this.turboHp) * 0.4;
        air = air - this.turboHp;
        this.turboBp += (air - this.turboBp) * Math.min(0.55, turboCentre / sr * 10);
        air = this.turboBp;

        this.turboTonePhase += turboCentre * invSr;
        const tone = Math.sin(this.turboTonePhase * 2 * Math.PI) * 0.22;

        turbo = (air * 0.75 + tone * 0.25) * this.sBoost * this.turboGain * (0.45 + this.sLoad * 0.5);
      }

      // ===== Overrun =====
      let over = 0;
      if (this.overrunEnv > 0.03) {
        const pop = n1 > 0.91 ? n2 * 0.75 : n1 * 0.06;
        over = pop * this.overrunEnv * 0.55;
      }

      // ===== Mix — brighter balance =====
      let s =
        comb * this.combustionGain * 0.85 +
        mech * this.mechanicalGain +
        turbo +
        over;

      // Short diffusion
      const d = this.delayBuf[this.delayIdx];
      this.delayBuf[this.delayIdx] = s * 0.22;
      this.delayIdx = (this.delayIdx + 1) % this.delayBuf.length;
      s += d * 0.18;

      // Output: light HP (remove mud) + mild LP (no harshness) + saturate
      this.outHp += (s - this.outHp) * 0.12;
      s = s - this.outHp * 0.65; // keep some low, cut mud
      this.outLp += (s - this.outLp) * 0.55; // brighter than before
      s = this.outLp * 0.55 + s * 0.45;

      s = Math.tanh(s * 1.15) * this.sGain * 0.58;
      ch[i] = s;
    }

    return true;
  }
}

registerProcessor('engine-processor', EngineProcessor);

import type { EngineProfile, EngineState, VehicleState } from '../types';

/**
 * Main-thread audio facade for EVoice.
 * Owns AudioContext, loads the worklet from /engine-processor.js, pushes params.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private masterGain: GainNode | null = null;
  private isReady = false;
  private isRunning = false;
  private currentProfile: EngineProfile | null = null;
  private lastParamsSend = 0;

  async init(): Promise<boolean> {
    if (this.isReady) return true;

    try {
      this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 });
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      await this.ctx.audioWorklet.addModule('/engine-processor.js');

      this.workletNode = new AudioWorkletNode(this.ctx, 'engine-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.65;

      this.workletNode.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.isReady = true;
      console.info('AudioEngine: worklet ready');
      return true;
    } catch (err) {
      console.error('AudioEngine worklet init failed:', err);
      return false;
    }
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setMasterVolume(v: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, v)),
        this.ctx.currentTime,
        0.04
      );
    }
  }

  setProfile(profile: EngineProfile) {
    this.currentProfile = profile;
    this.sendParams({
      engineState: 'OFF',
      rpm: profile.idleRpm,
      load: 0,
      boost: 0,
      throttle: 0,
    });
  }

  start() {
    this.isRunning = true;
    void this.resume();
  }

  stop() {
    this.isRunning = false;
    this.sendParams({
      engineState: 'OFF',
      rpm: 0,
      load: 0,
      boost: 0,
      throttle: 0,
    });
  }

  update(state: VehicleState) {
    if (!this.isReady || !this.isRunning) return;
    const now = performance.now();
    if (now - this.lastParamsSend < 16) return;
    this.lastParamsSend = now;
    this.sendParams(state);
  }

  private sendParams(state: Partial<VehicleState> & { engineState?: EngineState }) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'params',
      rpm: state.rpm ?? 0,
      load: state.load ?? 0,
      boost: state.boost ?? 0,
      throttle: state.throttle ?? 0,
      engineState: state.engineState ?? 'OFF',
      profile: this.currentProfile
        ? {
            cylinders: this.currentProfile.cylinders,
            idleRpm: this.currentProfile.idleRpm,
            redlineRpm: this.currentProfile.redlineRpm,
            baseFrequency: this.currentProfile.audio.baseFrequency,
            combustionGain: this.currentProfile.audio.combustionGain,
            mechanicalGain: this.currentProfile.audio.mechanicalGain,
            turboGain: this.currentProfile.audio.turboGain,
            dieselKnockIntensity: this.currentProfile.audio.dieselKnockIntensity,
          }
        : undefined,
    });
  }

  getContextState(): string {
    return this.ctx?.state ?? 'none';
  }

  dispose() {
    try {
      this.workletNode?.disconnect();
      this.masterGain?.disconnect();
      void this.ctx?.close();
    } catch { /* ignore */ }
    this.ctx = null;
    this.workletNode = null;
    this.masterGain = null;
    this.isReady = false;
  }
}

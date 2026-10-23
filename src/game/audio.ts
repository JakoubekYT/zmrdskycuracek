export class RaceAudioEngine {
  private ctx: AudioContext | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private subBassOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private tireNoiseSource: AudioBufferSourceNode | null = null;
  private tireFilter: BiquadFilterNode | null = null;
  private tireGain: GainNode | null = null;

  private muted = false;
  private running = false;
  private lastUpdateMs = 0;
  private lastGear = 1;

  private smoothFreq1 = 55;
  private smoothFreq2 = 110;
  private smoothSubFreq = 27.5;
  private smoothCutoff = 220;
  private smoothEngineGain = 0.0001;
  private smoothTireGain = 0.0001;
  private smoothTireFreq = 1400;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(m: boolean): void {
    this.muted = m;
    if (this.muted && this.engineGain && this.ctx) {
      this.engineGain.gain.value = 0.0001;
      if (this.tireGain) {
        this.tireGain.gain.value = 0.0001;
      }
    }
  }

  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 240;
      this.engineFilter.Q.value = 3.1;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0001;

      // Primary cylinder firing harmonic
      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc1.frequency.value = 55;

      // Upper exhaust harmonic
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'triangle';
      this.engineOsc2.frequency.value = 110;

      // Deep sub-octave V8/GT exhaust rumble
      this.subBassOsc = this.ctx.createOscillator();
      this.subBassOsc.type = 'square';
      this.subBassOsc.frequency.value = 27.5;
      const subGain = this.ctx.createGain();
      subGain.gain.value = 0.35;

      this.engineOsc1.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.subBassOsc.connect(subGain);
      subGain.connect(this.engineFilter);

      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);

      this.engineOsc1.start();
      this.engineOsc2.start();
      this.subBassOsc.start();

      // Tire screech & road noise loop
      const bufferSize = Math.floor(this.ctx.sampleRate * 1.0);
      const noiseBuffer = this.ctx.createBuffer(
        1,
        bufferSize,
        this.ctx.sampleRate
      );
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      this.tireNoiseSource = this.ctx.createBufferSource();
      this.tireNoiseSource.buffer = noiseBuffer;
      this.tireNoiseSource.loop = true;

      this.tireFilter = this.ctx.createBiquadFilter();
      this.tireFilter.type = 'bandpass';
      this.tireFilter.frequency.value = 1400;
      this.tireFilter.Q.value = 3.8;

      this.tireGain = this.ctx.createGain();
      this.tireGain.gain.value = 0.0001;

      this.tireNoiseSource.connect(this.tireFilter);
      this.tireFilter.connect(this.tireGain);
      this.tireGain.connect(this.ctx.destination);
      this.tireNoiseSource.start();

      this.running = true;
    } catch {
      // Ignore Web Audio errors in headless environments
    }
  }

  public updateEngine(
    rpm: number,
    throttle: number,
    isDrifting: boolean,
    slipAngleRad: number,
    nitroActive: boolean,
    active: boolean,
    gear = 1,
    onKerb = false
  ): void {
    if (
      !this.ctx ||
      !this.running ||
      !this.engineGain ||
      !this.engineOsc1 ||
      !this.engineOsc2 ||
      !this.subBassOsc ||
      !this.engineFilter
    ) {
      return;
    }

    if (active && gear !== this.lastGear && gear > 0 && this.lastGear > 0) {
      this.playGearShift(gear > this.lastGear);
      this.lastGear = gear;
    }

    const nowMs = performance.now();
    if (nowMs - this.lastUpdateMs < 32) {
      return;
    }
    this.lastUpdateMs = nowMs;

    if (this.muted || !active) {
      this.smoothEngineGain += (0.0001 - this.smoothEngineGain) * 0.35;
      this.smoothTireGain += (0.0001 - this.smoothTireGain) * 0.35;
      this.engineGain.gain.value = this.smoothEngineGain;
      if (this.tireGain) this.tireGain.gain.value = this.smoothTireGain;
      return;
    }

    const kerbMod = onKerb ? Math.sin(nowMs * 0.09) * 14 : 0;
    const targetFreq1 = 36 + (rpm / 8000) * 168 + kerbMod;
    const targetFreq2 = targetFreq1 * (nitroActive ? 2.15 : 1.5);
    const targetSub = targetFreq1 * 0.5;
    const targetCutoff =
      195 + (rpm / 8000) * 1050 + throttle * 380 + (nitroActive ? 550 : 0);
    const targetGain = 0.034 + throttle * 0.044 + (nitroActive ? 0.024 : 0);

    this.smoothFreq1 += (targetFreq1 - this.smoothFreq1) * 0.45;
    this.smoothFreq2 += (targetFreq2 - this.smoothFreq2) * 0.45;
    this.smoothSubFreq += (targetSub - this.smoothSubFreq) * 0.45;
    this.smoothCutoff += (targetCutoff - this.smoothCutoff) * 0.45;
    this.smoothEngineGain += (targetGain - this.smoothEngineGain) * 0.4;

    this.engineOsc1.frequency.value = this.smoothFreq1;
    this.engineOsc2.frequency.value = this.smoothFreq2;
    this.subBassOsc.frequency.value = this.smoothSubFreq;
    this.engineFilter.frequency.value = this.smoothCutoff;
    this.engineGain.gain.value = this.smoothEngineGain;

    if (this.tireGain && this.tireFilter) {
      const slipIntensity = isDrifting
        ? Math.min(1, Math.abs(slipAngleRad) * 2.5)
        : onKerb
        ? 0.25
        : 0;
      const targetTireGain = slipIntensity * 0.052;
      const targetTireFreq = onKerb
        ? 420
        : 1220 + slipIntensity * 620;
      this.smoothTireGain += (targetTireGain - this.smoothTireGain) * 0.4;
      this.smoothTireFreq += (targetTireFreq - this.smoothTireFreq) * 0.4;
      this.tireGain.gain.value = this.smoothTireGain;
      this.tireFilter.frequency.value = this.smoothTireFreq;
    }
  }

  public playGearShift(isUpShift = true): void {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = isUpShift ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(isUpShift ? 580 : 140, now);
      osc.frequency.exponentialRampToValueAtTime(
        isUpShift ? 190 : 85,
        now + 0.09
      );

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.11);
    } catch {
      // Ignore
    }
  }

  public playImpact(severity: number): void {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(115 + severity * 65, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.15);

      gain.gain.setValueAtTime(Math.min(0.16, 0.05 + severity * 0.11), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } catch {
      // Ignore
    }
  }

  public playLapComplete(isFinalVictory: boolean): void {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const notes = isFinalVictory
        ? [523.25, 659.25, 783.99, 1046.5]
        : [440, 554.37, 659.25];
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.075, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.26);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.28);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Realistic F1 pneumatic wheel gun impact wrench sound (rapid torque rattle)
   */
  public playWheelGunSound(quality: 'perfect' | 'good' | 'slow'): void {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const burstCount = quality === 'perfect' ? 5 : quality === 'good' ? 6 : 8;
      const step = 0.024;
      const pitchBase = quality === 'perfect' ? 1400 : quality === 'good' ? 1100 : 750;

      for (let i = 0; i < burstCount; i++) {
        const t = now + i * step;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(pitchBase + (i % 2 === 0 ? 300 : -150), t);
        osc.frequency.exponentialRampToValueAtTime(pitchBase * 0.4, t + step * 0.85);

        gain.gain.setValueAtTime(0.07, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + step * 0.9);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + step);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Hydraulic jack release whoosh and solid chassis drop clack
   */
  public playJackReleaseSound(): void {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      // Air release hiss/whoosh
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.18);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.24);

      // Chassis drop thump
      const thump = this.ctx.createOscillator();
      const thumpGain = this.ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(140, now + 0.12);
      thump.frequency.exponentialRampToValueAtTime(40, now + 0.28);
      thumpGain.gain.setValueAtTime(0.12, now + 0.12);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      thump.connect(thumpGain);
      thumpGain.connect(this.ctx.destination);
      thump.start(now + 0.12);
      thump.stop(now + 0.34);
    } catch {
      // Ignore
    }
  }

  public dispose(): void {
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      this.subBassOsc?.stop();
      this.tireNoiseSource?.stop();
      this.ctx?.close();
    } catch {
      // Ignore
    }
    this.ctx = null;
    this.running = false;
  }
}

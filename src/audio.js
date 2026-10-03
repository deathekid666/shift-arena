export class WeaponAudio {
  constructor() {
    this.ctx = null;
    this.noiseBuffer = null;
  }

  unlock() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    if (!this.ctx) {
      this.ctx = new AudioCtor();
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  createNoiseBuffer() {
    const length = Math.floor(this.ctx.sampleRate * 0.35);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  playFang(type) {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const master = this.ctx.createGain();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const profiles = {
      draw: { from: 520, to: 760, duration: 0.08, gain: 0.045, wave: 'triangle' },
      slash: { from: 900, to: 180, duration: 0.11, gain: 0.08, wave: 'sawtooth' },
      charge: { from: 180, to: 420, duration: 0.15, gain: 0.04, wave: 'sine' },
      throw: { from: 760, to: 120, duration: 0.14, gain: 0.09, wave: 'triangle' },
      hit: { from: 145, to: 70, duration: 0.09, gain: 0.08, wave: 'square' },
      head: { from: 620, to: 115, duration: 0.18, gain: 0.12, wave: 'sawtooth' },
      recover: { from: 360, to: 680, duration: 0.10, gain: 0.055, wave: 'triangle' },
      claw: { from: 520, to: 150, duration: 0.08, gain: 0.05, wave: 'sawtooth' }
    };

    const p = profiles[type] ?? profiles.hit;
    master.gain.setValueAtTime(p.gain, now);
    master.gain.exponentialRampToValueAtTime(0.001, now + p.duration);
    master.connect(this.ctx.destination);

    osc.type = p.wave;
    osc.frequency.setValueAtTime(p.from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, p.to), now + p.duration);
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.duration);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + p.duration);
  }

  playPump() {
    if (!this.ctx || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;

    const clack = (delay, pitch, gainValue) => {
      const start = now + delay;

      const master = this.ctx.createGain();
      master.gain.setValueAtTime(gainValue, start);
      master.gain.exponentialRampToValueAtTime(
        0.001,
        start + 0.065
      );
      master.connect(this.ctx.destination);

      const tone = this.ctx.createOscillator();
      tone.type = 'square';
      tone.frequency.setValueAtTime(pitch, start);
      tone.frequency.exponentialRampToValueAtTime(
        Math.max(45, pitch * 0.48),
        start + 0.055
      );

      const toneGain = this.ctx.createGain();
      toneGain.gain.setValueAtTime(0.34, start);
      toneGain.gain.exponentialRampToValueAtTime(
        0.001,
        start + 0.060
      );
      tone.connect(toneGain).connect(master);
      tone.start(start);
      tone.stop(start + 0.065);

      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1150;
      filter.Q.value = 1.2;

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.26, start);
      noiseGain.gain.exponentialRampToValueAtTime(
        0.001,
        start + 0.050
      );

      noise
        .connect(filter)
        .connect(noiseGain)
        .connect(master);

      noise.start(start);
      noise.stop(start + 0.055);
    };

    // Slide back, then lock forward.
    clack(0.00, 185, 0.085);
    clack(0.22, 245, 0.070);
  }

  playShot(profile) {
    if (!this.ctx || !profile) return;

    const now = this.ctx.currentTime;
    const duration = profile.duration;
    const master = this.ctx.createGain();
    master.gain.setValueAtTime(profile.gain, now);
    master.gain.exponentialRampToValueAtTime(0.001, now + duration);
    master.connect(this.ctx.destination);

    const tone = this.ctx.createOscillator();
    const toneGain = this.ctx.createGain();
    tone.type = profile.pitch < 80 ? 'sawtooth' : 'square';
    tone.frequency.setValueAtTime(profile.pitch, now);
    tone.frequency.exponentialRampToValueAtTime(Math.max(32, profile.pitch * 0.45), now + duration);
    toneGain.gain.setValueAtTime(0.75, now);
    toneGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    tone.connect(toneGain).connect(master);
    tone.start(now);
    tone.stop(now + duration);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = profile.pitch < 90 ? 'lowpass' : 'bandpass';
    filter.frequency.value = profile.pitch < 90 ? 1200 : 2200 + profile.pitch * 5;
    filter.Q.value = 0.7;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(profile.noise, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.92);
    noise.connect(filter).connect(noiseGain).connect(master);
    noise.start(now);
    noise.stop(now + duration);
  }
}

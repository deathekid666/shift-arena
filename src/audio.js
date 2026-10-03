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

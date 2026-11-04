/**
 * Audio synthesis for chat notifications and message sound effects
 */
class SoundEffects {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playSendSound() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // Audio playback might be restricted by user policy
    }
  }

  playReceiveSound() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(783.99, now); // G5
      osc.frequency.setValueAtTime(1046.5, now + 0.08); // C6
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(now + 0.22);
    } catch {
      // Ignore audio error
    }
  }
}

export const soundEffects = new SoundEffects();

/**
 * Generate a synthetic audio clip for testing if mic is unavailable
 */
export function generateSyntheticAudioBlob(durationSeconds: number = 3): Promise<{ blob: Blob; url: string }> {
  return new Promise((resolve) => {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      const emptyBlob = new Blob([], { type: 'audio/webm' });
      resolve({ blob: emptyBlob, url: '' });
      return;
    }

    const sampleRate = 44100;
    const ctx = new AudioCtx({ sampleRate });
    const length = sampleRate * durationSeconds;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Generate vocal-like modulated tone
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const voiceCarrier = Math.sin(2 * Math.PI * 220 * t);
      const modulation = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t);
      const envelope = Math.min(1, Math.sin((Math.PI * i) / length) * 1.5);
      data[i] = voiceCarrier * modulation * envelope * 0.25;
    }

    // Convert buffer to wav blob
    const wavBlob = audioBufferToWavBlob(buffer);
    const url = URL.createObjectURL(wavBlob);
    resolve({ blob: wavBlob, url });
  });
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  const channels: Float32Array[] = [];
  let sample: number;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    out.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: number) {
    out.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF identifier
  out.setUint32(0, 0x46464952, true); // "RIFF"
  out.setUint32(4, length - 8, true);
  out.setUint32(8, 0x45564157, true); // "WAVE"
  // fmt chunk
  out.setUint32(12, 0x20746d66, true); // "fmt "
  setUint32(16); // 16 for PCM
  pos = 20;
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16); // bits per sample
  // data chunk
  out.setUint32(36, 0x61746164, true); // "data"
  out.setUint32(40, length - pos - 4, true);
  pos = 44;

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out.buffer], { type: 'audio/wav' });
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

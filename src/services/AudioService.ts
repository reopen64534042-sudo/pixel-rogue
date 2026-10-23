export class AudioService {
  muted = false;
  private context: AudioContext | null = null;
  private warned = false;
  private cues: ReturnType<typeof setTimeout>[] = [];
  cancelCues() {
    this.cues.forEach(clearTimeout);
    this.cues = [];
  }
  startCue() {
    this.beep(523, 0.1, "square", 0.06);
    if (!this.muted && typeof window !== "undefined")
      this.cues.push(
        setTimeout(() => this.beep(784, 0.15, "square", 0.06), 110),
      );
  }
  overCue() {
    this.beep(220, 0.4, "sawtooth", 0.09, -160);
    if (!this.muted && typeof window !== "undefined")
      this.cues.push(
        setTimeout(() => this.beep(160, 0.6, "sawtooth", 0.09, -110), 300),
      );
  }
  beep(
    freq = 440,
    dur = 0.08,
    type: OscillatorType = "square",
    vol = 0.06,
    slide = 0,
  ) {
    if (this.muted || typeof window === "undefined") return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended")
        void this.context.resume().catch((error) => this.report(error));
      const ac = this.context,
        o = ac.createOscillator(),
        g = ac.createGain();
      o.type = type;
      o.frequency.value = freq;
      if (slide)
        o.frequency.exponentialRampToValueAtTime(
          Math.max(40, freq + slide),
          ac.currentTime + dur,
        );
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + dur);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    } catch (error) {
      this.report(error);
    }
  }
  private report(error: unknown) {
    if (!this.warned) {
      console.warn("音频不可用，游戏继续以静音运行", error);
      this.warned = true;
    }
  }
  dispose() {
    this.cancelCues();
    if (this.context)
      void this.context.close().catch((error) => this.report(error));
    this.context = null;
  }
}

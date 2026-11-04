import { DOMAIN_AUDIO, type DomainSoundId } from '../game/data/domainAudio';
import { AudioSettings, DEFAULT_AUDIO_SETTINGS, type AudioVolumeChannel } from './AudioSettings';
export class AudioService {
  private readonly settingsStore = new AudioSettings();
  private preferences = this.settingsStore.read();
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private warned = false;
  private cues: ReturnType<typeof setTimeout>[] = [];
  private buffers = new Map<DomainSoundId, Promise<AudioBuffer>>();
  private samples = new Set<AudioBufferSourceNode>();
  private priorities = new Map<AudioBufferSourceNode,number>();
  private ambient: AudioBufferSourceNode | null = null;
  private ambientGain:GainNode|null=null;
  private ambientEpoch=0;
  private ambientId: DomainSoundId | null = null;
  private audioEpoch = 0;
  private domainActive = true;
  get muted(): boolean { return this.preferences.muted; }
  set muted(value: boolean) {
    this.preferences.muted = value;
    this.applySettings();
  }
  get masterVolume(): number { return this.preferences.masterVolume; }
  get sfxVolume(): number { return this.preferences.sfxVolume; }
  get settingsError(): string | null { return this.settingsStore.lastError; }
  private get audible(): boolean {
    return !this.muted && this.masterVolume > 0 && this.sfxVolume > 0;
  }
  setVolume(channel: AudioVolumeChannel, volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.preferences[channel] = Math.max(0, Math.min(1, volume));
    this.applySettings();
  }
  resetSettings(): void {
    this.preferences = { ...DEFAULT_AUDIO_SETTINGS };
    this.applySettings();
  }
  private applySettings(): void {
    if (this.context && this.masterGain && this.sfxGain) {
      const now = this.context.currentTime;
      for (const [node, volume] of [
        [this.masterGain, this.muted ? 0 : this.masterVolume],
        [this.sfxGain, this.sfxVolume],
      ] as const) {
        node.gain.cancelScheduledValues(now);
        node.gain.setValueAtTime(node.gain.value, now);
        if (volume === 0) node.gain.setValueAtTime(0, now);
        else node.gain.linearRampToValueAtTime(volume, now + .012);
      }
    }
    if (!this.audible) {
      this.cancelCues();
      this.stopDomainAudio();
    }
    this.settingsStore.write(this.preferences);
  }
  /** Every oscillator, sample and ambient loop shares this live volume bus. */
  private output(): GainNode {
    if (this.sfxGain) return this.sfxGain;
    const ac = this.context ??= new AudioContext();
    this.masterGain = ac.createGain();
    this.sfxGain = ac.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(ac.destination);
    return this.sfxGain;
  }
  syncDomainAudio(active:boolean,ambient:DomainSoundId|null) {
    if (!active && this.domainActive) this.stopDomainAudio();
    this.domainActive=active;
    if (active) this.setDomainAmbient(ambient);
  }
  warmDomain() {
    if (typeof window === 'undefined') return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(error => this.report(error));
      for (const id of Object.keys(DOMAIN_AUDIO) as DomainSoundId[])
        void this.domainBuffer(id).catch(error => this.report(error));
    } catch (error) {this.report(error);}
  }
  private async domainBuffer(id:DomainSoundId):Promise<AudioBuffer> {
    const existing=this.buffers.get(id);
    if (existing) return existing;
    this.context ??= new AudioContext();
    const ac=this.context;
    const pending=fetch(`${import.meta.env.BASE_URL}${DOMAIN_AUDIO[id].file}`)
      .then(response=>{if (!response.ok) throw new Error(`Domain audio ${id}: ${response.status}`);return response.arrayBuffer();})
      .then(bytes=>ac.decodeAudioData(bytes));
    this.buffers.set(id,pending);
    return pending;
  }
  domainSound(id:DomainSoundId) {
    if (!this.audible || !this.domainActive || typeof window==='undefined') return;
    const epoch=this.audioEpoch, requested=Date.now();
    void this.domainBuffer(id).then(buffer=>{
      if (!this.audible || epoch!==this.audioEpoch || Date.now()-requested>200 || !this.context) return;
      const priority=id==='blackhole-impact'||id==='terminal-impact'?100:id==='collapse-in'||id.startsWith('learn-')?80:60;
      if (this.samples.size>=8) {
        const weakest=[...this.priorities].sort((a,b)=>a[1]-b[1])[0];
        if (!weakest || weakest[1]>=priority) return;
        weakest[0].stop();this.samples.delete(weakest[0]);this.priorities.delete(weakest[0]);
      }
      const ac=this.context, source=ac.createBufferSource(), gain=ac.createGain();
      const modifier=['gravity-core','collapse-theory','gravity-crush','absolute-gravity','mass-focus','critical-impact','true-tear'].includes(id);
      source.buffer=buffer;gain.gain.value=modifier?.18:.5;
      source.connect(gain);gain.connect(this.output());
      this.samples.add(source);
      this.priorities.set(source,priority);
      source.onended=()=>{this.samples.delete(source);this.priorities.delete(source);source.disconnect();gain.disconnect();};
      source.start();
    }).catch(error=>this.report(error));
  }
  setDomainAmbient(id:DomainSoundId|null) {
    if (!this.audible) id=null;
    if (id===this.ambientId) return;
    const ticket=++this.ambientEpoch;
    if (this.ambient && this.context) {
      const now=this.context.currentTime;
      this.ambientGain?.gain.cancelScheduledValues(now);
      this.ambientGain?.gain.setValueAtTime(this.ambientGain.gain.value,now);
      this.ambientGain?.gain.linearRampToValueAtTime(0,now+.012);
      this.ambient.stop(now+.012);
    }
    this.ambient=null;this.ambientGain=null;this.ambientId=id;
    if (!id || typeof window==='undefined') return;
    const epoch=this.audioEpoch;
    void this.domainBuffer(id).then(buffer=>{
      if (epoch!==this.audioEpoch || ticket!==this.ambientEpoch || this.ambientId!==id || !this.audible || !this.context) return;
      const source=this.context.createBufferSource(),gain=this.context.createGain();
      source.buffer=buffer;source.loop=true;gain.gain.setValueAtTime(0,this.context.currentTime);
      gain.gain.linearRampToValueAtTime(.18,this.context.currentTime+.012);
      source.connect(gain);gain.connect(this.output());
      source.onended=()=>{source.disconnect();gain.disconnect();};
      this.ambient=source;this.ambientGain=gain;source.start();
    }).catch(error=>this.report(error));
  }
  stopDomainAudio() {
    this.audioEpoch++;
    this.setDomainAmbient(null);
    for (const source of this.samples) source.stop();
    this.samples.clear();
    this.priorities.clear();
  }
  cancelCues() {
    this.cues.forEach(clearTimeout);
    this.cues = [];
  }
  startCue() {
    this.beep(523, 0.1, "square", 0.06);
    if (this.audible && typeof window !== "undefined")
      this.cues.push(
        setTimeout(() => this.beep(784, 0.15, "square", 0.06), 110),
      );
  }
  overCue() {
    this.beep(220, 0.4, "sawtooth", 0.09, -160);
    if (this.audible && typeof window !== "undefined")
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
    if (!this.audible || typeof window === "undefined") return;
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
      g.connect(this.output());
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
    this.stopDomainAudio();
    this.buffers.clear();
    this.cancelCues();
    if (this.context)
      void this.context.close().catch((error) => this.report(error));
    this.context = null;
    this.sfxGain = null;
    this.masterGain = null;
  }
}

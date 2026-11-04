import type { AudioService } from "../services/AudioService";
import type { AudioVolumeChannel } from "../services/AudioSettings";
import { element, trapTabFocus } from "./dom";

const VOLUME_CONTROLS = [
  { channel: "masterVolume", id: "audio-master" },
  { channel: "sfxVolume", id: "audio-sfx" },
] as const satisfies readonly { channel: AudioVolumeChannel; id: string }[];

/** DOM-only preferences panel; all playback and persistence belong to AudioService. */
export class AudioSettingsUI {
  private readonly overlay = element("ov-audio");

  constructor(private readonly audio: AudioService) {
    for (const { channel, id } of VOLUME_CONTROLS) {
      const input = element(id) as HTMLInputElement;
      input.oninput = () => {
        this.audio.setVolume(channel, Number(input.value) / 100);
        this.render();
      };
    }
    element("btn-audio-mute").onclick = () => this.toggleMute();
    element("btn-audio-preview").onclick = () => this.audio.startCue();
    element("btn-audio-reset").onclick = () => {
      this.audio.resetSettings();
      this.render();
    };
    element("btn-audio-back").onclick = () => this.close(true);
  }

  get isOpen(): boolean {
    return !this.overlay.classList.contains("hidden");
  }

  open(): void {
    this.render();
    this.overlay.classList.remove("hidden");
    element("audio-master").focus();
  }

  close(restoreFocus = false): void {
    this.overlay.classList.add("hidden");
    this.audio.cancelCues();
    if (restoreFocus) element("btn-settings-audio").focus();
  }

  private toggleMute(): void {
    this.audio.muted = !this.audio.muted;
    this.render();
  }

  private render(): void {
    for (const { channel, id } of VOLUME_CONTROLS) {
      const percent = Math.round(this.audio[channel] * 100);
      const input = element(id) as HTMLInputElement;
      input.value = String(percent);
      input.setAttribute("aria-valuetext", `${percent}%`);
      input.style.setProperty("--audio-fill", `${percent}%`);
      element(`${id}-value`).textContent = `${percent}%`;
    }
    const muted = this.audio.muted;
    const silent = muted || this.audio.masterVolume === 0 || this.audio.sfxVolume === 0;
    const mute = element("btn-audio-mute");
    mute.textContent = muted ? "取消静音" : "全部静音";
    mute.setAttribute("aria-pressed", String(muted));
    (element("btn-audio-preview") as HTMLButtonElement).disabled = silent;
    element("audio-status").textContent = muted
      ? "当前已静音 · 取消静音后恢复所设音量"
      : silent ? "当前音量为 0 · 调高两个音量后可试听" : "声音已开启 · 点击试听感受当前音量";
    const hint = element("audio-save-hint");
    hint.textContent = this.audio.settingsError
      ? "本地设置无法读取或保存 · 当前调整仍在本次打开期间生效"
      : "调整立即生效，自动保存到此浏览器";
    hint.title = this.audio.settingsError ?? "";
  }

  handleKey(event: KeyboardEvent): boolean {
    if (!this.isOpen) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      this.close(true);
    } else if (event.key.toLowerCase() === "m" && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      if (!event.repeat) this.toggleMute();
    } else trapTabFocus(event, this.overlay);
    // Preserve native range / Tab / Enter behavior while preventing game shortcuts.
    return true;
  }

  dispose(): void {
    this.close();
    for (const { id } of VOLUME_CONTROLS) element(id).oninput = null;
    for (const id of ["btn-audio-mute", "btn-audio-preview", "btn-audio-reset", "btn-audio-back"])
      element(id).onclick = null;
  }
}

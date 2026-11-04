export interface AudioPreferences {
  masterVolume: number;
  sfxVolume: number;
  muted: boolean;
}

export type AudioVolumeChannel = "masterVolume" | "sfxVolume";
export const AUDIO_SETTINGS_KEY = "pixelrogue_audio";
export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioPreferences> = Object.freeze({
  masterVolume: 1,
  sfxVolume: 1,
  muted: false,
});

function isVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Independent v1 preferences; reading invalid data never overwrites it. */
export class AudioSettings {
  lastError: string | null = null;

  read(): AudioPreferences {
    try {
      const raw = globalThis.localStorage?.getItem(AUDIO_SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "object" || value === null) throw new Error("音频设置格式不兼容");
      const data = value as Record<string, unknown>;
      if (data.v !== 1 || !isVolume(data.masterVolume) || !isVolume(data.sfxVolume) || typeof data.muted !== "boolean")
        throw new Error("音频设置格式不兼容");
      return { masterVolume: data.masterVolume, sfxVolume: data.sfxVolume, muted: data.muted };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return { ...DEFAULT_AUDIO_SETTINGS };
    }
  }

  write(preferences: AudioPreferences): void {
    this.lastError = null;
    try {
      if (!globalThis.localStorage) throw new Error("本地存储不可用");
      globalThis.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ v: 1, ...preferences }));
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }
}

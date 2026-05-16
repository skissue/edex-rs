type Sound = {
  play: () => void;
};

const silentSound: Sound = {
  play: () => undefined,
};

const audioUrls = {
  alarm: new URL("./assets/audio/alarm.wav", import.meta.url).href,
  denied: new URL("./assets/audio/denied.wav", import.meta.url).href,
  error: new URL("./assets/audio/error.wav", import.meta.url).href,
  expand: new URL("./assets/audio/expand.wav", import.meta.url).href,
  folder: new URL("./assets/audio/folder.wav", import.meta.url).href,
  granted: new URL("./assets/audio/granted.wav", import.meta.url).href,
  info: new URL("./assets/audio/info.wav", import.meta.url).href,
  keyboard: new URL("./assets/audio/keyboard.wav", import.meta.url).href,
  panels: new URL("./assets/audio/panels.wav", import.meta.url).href,
  scan: new URL("./assets/audio/scan.wav", import.meta.url).href,
  stdin: new URL("./assets/audio/stdin.wav", import.meta.url).href,
  stdout: new URL("./assets/audio/stdout.wav", import.meta.url).href,
  theme: new URL("./assets/audio/theme.wav", import.meta.url).href,
};

type SoundName = keyof typeof audioUrls;

function soundFromUrl(url: string, volume: number): Sound {
  return {
    play: () => {
      const instance = new Audio(url);
      instance.preload = "auto";
      instance.volume = volume;
      instance.play().catch(() => undefined);
    },
  };
}

declare global {
  interface Window {
    audioManager?: Record<string, Sound | undefined>;
  }
}

export class AudioManager {
  private readonly sounds: Record<string, Sound> = {};

  constructor() {
    const enabled = window.settings.audio === true;
    const feedbackEnabled = window.settings.disableFeedbackAudio === false;
    const globalVolume = typeof window.settings.audioVolume === "number" ? window.settings.audioVolume : 1;

    if (enabled) {
      const load = (name: SoundName, volume = 1) => {
        this.sounds[name] = soundFromUrl(audioUrls[name], Math.max(0, Math.min(1, globalVolume * volume)));
      };

      if (feedbackEnabled) {
        load("stdout", 0.4);
        load("stdin", 0.4);
        load("folder");
        load("granted");
      }

      load("keyboard");
      load("theme");
      load("expand");
      load("panels");
      load("scan");
      load("denied");
      load("info");
      load("alarm");
      load("error");
    }

    return new Proxy(this.sounds, {
      get: (target, sound: string) => target[sound] || silentSound,
    }) as unknown as AudioManager;
  }
}

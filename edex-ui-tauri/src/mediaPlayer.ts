import iconsJson from "./assets/icons/file-icons.json";

type Icon = {
  width: number | null;
  height: number | null;
  svg: string;
};

const icons = iconsJson as unknown as Record<string, Icon | undefined>;

function icon(name: string, color: string) {
  const entry = icons[name];
  if (!entry) return "";
  return `<svg viewBox="0 0 ${entry.width || 24} ${entry.height || 24}" fill="${color}">${entry.svg}</svg>`;
}

function mediaTimeToHMS(time: number) {
  let seconds = Math.floor(time);
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return `${hours < 10 ? "0" : ""}${hours}:${minutes < 10 ? "0" : ""}${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

function positionInElement(event: MouseEvent, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
}

export class MediaPlayer {
  private volumeDrag = false;
  private fullscreenVisible = true;
  private fullscreenTimeout: number | null = null;

  constructor(opts: { modalId: string; type: "audio" | "video" }) {
    const modal = document.getElementById(`modal_${opts.modalId}`);
    if (!modal) throw new Error(`Missing media modal: ${opts.modalId}`);

    const mediaContainer = modal.querySelector<HTMLElement>(".media_container");
    const media = modal.querySelector<HTMLMediaElement>(opts.type);
    const mediaControls = modal.querySelector<HTMLElement>(".media_controls");
    const playpause = modal.querySelector<HTMLElement>(".playpause");
    const volumeIcon = modal.querySelector<HTMLElement>(".volume_icon");
    const volume = modal.querySelector<HTMLElement>(".volume");
    const volumeBar = modal.querySelector<HTMLElement>(".volume_bar");
    const progress = modal.querySelector<HTMLElement>(".progress");
    const progressBar = modal.querySelector<HTMLElement>(".progress_bar");
    const fullscreen = modal.querySelector<HTMLElement>(".fs");
    const mediaTime = modal.querySelector<HTMLElement>(".media_time");

    if (!mediaContainer || !media || !mediaControls || !playpause || !volumeIcon || !volume || !volumeBar || !progress || !progressBar || !mediaTime) {
      throw new Error("Media player DOM failed to initialize");
    }

    const iconcolor = `rgb(${window.theme?.r ?? 170}, ${window.theme?.g ?? 207}, ${window.theme?.b ?? 209})`;
    media.controls = false;
    mediaControls.setAttribute("data-state", "visible");

    const changeButtonState = () => {
      if (media.paused || media.ended) {
        playpause.setAttribute("data-state", "play");
        playpause.innerHTML = icon("play", iconcolor);
      } else {
        playpause.setAttribute("data-state", "pause");
        playpause.innerHTML = icon("pause", iconcolor);
      }
    };

    const setFullscreenData = (state: boolean) => {
      if (fullscreen === null) return;
      mediaContainer.setAttribute("data-fullscreen", String(!!state));
      fullscreen.setAttribute("data-state", state ? "cancel-fullscreen" : "go-fullscreen");
      fullscreen.innerHTML = icon(state ? "fullscreen-exit" : "fullscreen", iconcolor);
    };

    const fullscreenHidden = () => {
      mediaContainer.style.cursor = "none";
      mediaControls.classList.add("fullscreen_hidden");
    };

    const fullscreenVisible = () => {
      mediaContainer.style.cursor = "default";
      mediaControls.classList.remove("fullscreen_hidden");
    };

    const handleFullscreenControls = () => {
      if (!this.fullscreenVisible) {
        this.fullscreenVisible = true;
        fullscreenVisible();
        if (this.fullscreenTimeout !== null) window.clearTimeout(this.fullscreenTimeout);
        this.fullscreenTimeout = window.setTimeout(() => {
          this.fullscreenVisible = false;
          fullscreenHidden();
        }, 2000);
      }
    };

    const handleFullscreen = () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
        setFullscreenData(false);
        mediaContainer.removeEventListener("mousemove", handleFullscreenControls);
        this.fullscreenVisible = true;
        if (this.fullscreenTimeout !== null) window.clearTimeout(this.fullscreenTimeout);
        fullscreenVisible();
      } else {
        void mediaContainer.requestFullscreen();
        setFullscreenData(true);
        this.fullscreenVisible = false;
        fullscreenHidden();
        mediaContainer.addEventListener("mousemove", handleFullscreenControls);
      }
    };

    const updateVolumeIcon = (vol: number) => {
      volumeIcon.innerHTML = icon(vol > 0 ? "volume" : "mute", iconcolor);
    };

    const updateVolume = (event: MouseEvent) => {
      const vol = positionInElement(event, volumeBar);
      volumeBar.style.clip = `rect(0px, ${(vol * 100) / 20}vw,2vh,0px)`;
      media.volume = vol;
      updateVolumeIcon(vol);
    };

    media.addEventListener("loadedmetadata", () => {
      mediaTime.textContent = "00:00:00";
    });
    media.addEventListener("play", changeButtonState, false);
    media.addEventListener("pause", changeButtonState, false);
    media.addEventListener("timeupdate", () => {
      progressBar.style.width = `${Math.floor((media.currentTime / media.duration) * 100)}%`;
      mediaTime.textContent = mediaTimeToHMS(media.currentTime);
    });

    volume.addEventListener("mousedown", (event) => {
      this.volumeDrag = true;
      media.muted = false;
      updateVolume(event);
    });

    volumeIcon.addEventListener("click", () => {
      media.muted = !media.muted;
      if (media.muted) volumeIcon.innerHTML = icon("mute", iconcolor);
      else updateVolumeIcon(media.volume);
    });

    progress.addEventListener("click", (event) => {
      media.currentTime = positionInElement(event, progress) * media.duration;
    });
    playpause.addEventListener("click", () => {
      if (media.paused || media.ended) void media.play();
      else media.pause();
    });
    if (fullscreen) fullscreen.addEventListener("click", handleFullscreen);

    document.addEventListener("fullscreenchange", () => {
      setFullscreenData(!!document.fullscreenElement);
    });
    document.addEventListener("mouseup", (event) => {
      if (!this.volumeDrag) return;
      this.volumeDrag = false;
      updateVolume(event);
    });
    document.addEventListener("mousemove", (event) => {
      if (this.volumeDrag) updateVolume(event);
    });
  }
}

import {
  getFilesystemUsage,
  listFilesystemDevices,
  listFilesystemDirectory,
  openPathExternal,
  type FilesystemDevice,
  type FilesystemEntry,
  type FilesystemUsage,
  type JsonObject,
} from "./backend";
import iconsJson from "./assets/icons/file-icons.json";
import matchIcon from "./assets/misc/file-icons-match.js";
import type { TauriTerminal } from "./terminal";

type Icon = {
  width: number | null;
  height: number | null;
  svg: string;
};

type DisplayBlock = {
  name: string;
  path?: string;
  entryType: string;
  category?: string;
  hidden?: boolean;
  size?: number | string | null;
  lastAccessed?: number | string | null;
};

const icons = iconsJson as unknown as Record<string, Icon | undefined>;

function activeTerminal() {
  return window.term?.[window.currentTerm || 0] as TauriTerminal | undefined;
}

function parentPath(path: string) {
  const separator = path.includes("\\") ? "\\" : "/";
  const normalized = path.endsWith(separator) && path.length > 1 ? path.slice(0, -1) : path;
  const index = normalized.lastIndexOf(separator);
  if (index <= 0) return separator;
  return normalized.slice(0, index);
}

function quoteShellPath(path: string) {
  return `"${path.replace(/(["\\$`])/g, "\\$1")}"`;
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const unit = 1024;
  const precision = decimals < 0 ? 0 : decimals;
  const labels = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const exponent = Math.floor(Math.log(bytes) / Math.log(unit));
  return `${parseFloat((bytes / unit ** exponent).toFixed(precision))} ${labels[exponent]}`;
}

function settingsBool(settings: JsonObject, key: string) {
  return settings[key] === true;
}

function iconFor(block: DisplayBlock) {
  switch (block.entryType) {
    case "showDisks":
      return icons.showDisks || icons.disk || icons.other;
    case "up":
      return icons.up || icons.dir || icons.other;
    case "disk":
    case "rom":
    case "usb":
      return icons[block.entryType] || icons.disk || icons.other;
    case "symlink":
      return icons.symlink || icons.other;
    case "edex-theme":
    case "edex-kblayout":
    case "edex-settings":
    case "edex-shortcuts":
      return icons.settings || icons.file || icons.other;
    case "edex-themesDir":
    case "edex-kblayoutsDir":
      return icons.dir || icons.other;
    default: {
      const iconName = matchIcon(block.name);
      const matched = iconName ? icons[iconName] : undefined;
      if (matched) return matched;
      if (block.category === "dir") return icons.dir || icons.other;
      if (block.category === "file") return icons.file || icons.other;
      return icons.other;
    }
  }
}

function displayType(block: DisplayBlock) {
  if (block.entryType === "edex-theme") return "eDEX-UI theme";
  if (block.entryType === "edex-kblayout") return "eDEX-UI keyboard layout";
  if (block.entryType === "edex-settings" || block.entryType === "edex-shortcuts") return "eDEX-UI config file";
  if (block.entryType === "edex-themesDir") return "eDEX-UI themes folder";
  if (block.entryType === "edex-kblayoutsDir") return "eDEX-UI keyboards folder";
  if (block.entryType === "showDisks" || block.entryType === "up") return "--";
  if (block.category === "dir") return "folder";
  if (block.entryType === "file") {
    const iconName = matchIcon(block.name);
    return iconName ? iconName.replace("icon-", "") : "file";
  }
  return block.entryType;
}

export class FilesystemDisplay {
  cwd: DisplayBlock[] = [];
  cwd_path: string | null = null;
  dirpath = "";
  failed = false;

  private readonly container: HTMLElement;
  private readonly filesContainer: HTMLElement;
  private readonly title: HTMLElement;
  private readonly spaceText: HTMLElement;
  private readonly spaceBar: HTMLProgressElement;
  private readonly iconcolor: string;
  private _noTracking = false;
  private _reading = false;

  constructor(opts: { parentId: string }) {
    const container = document.getElementById(opts.parentId);
    if (!container) throw new Error(`missing filesystem parent: ${opts.parentId}`);

    this.container = container;
    this.iconcolor = window.theme ? `rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b})` : "currentColor";

    this.container.innerHTML = `
      <h3 class="title"><p>FILESYSTEM</p><p id="fs_disp_title_dir"></p></h3>
      <div id="fs_disp_container"></div>
      <div id="fs_space_bar">
        <h1>EXIT DISPLAY</h1>
        <h3>Calculating available space...</h3><progress value="100" max="100"></progress>
      </div>`;

    const filesContainer = document.getElementById("fs_disp_container");
    const title = document.getElementById("fs_disp_title_dir");
    const spaceText = document.querySelector<HTMLElement>("#fs_space_bar > h3");
    const spaceBar = document.querySelector<HTMLProgressElement>("#fs_space_bar > progress");
    if (!filesContainer || !title || !spaceText || !spaceBar) throw new Error("filesystem DOM failed to initialize");

    this.filesContainer = filesContainer;
    this.title = title;
    this.spaceText = spaceText;
    this.spaceBar = spaceBar;

    if (settingsBool(window.settings, "hideDotfiles")) this.container.classList.add("hideDotfiles");
    if (settingsBool(window.settings, "fsListView")) this.container.classList.add("list-view");

    const initialCwd = activeTerminal()?.cwd || (typeof window.settings.cwd === "string" ? window.settings.cwd : "");
    if (initialCwd) void this.readFS(initialCwd);
  }

  followTab() {
    const cwd = activeTerminal()?.cwd;
    if (cwd) this.handleCwd(cwd);
  }

  handleCwd(cwd: string | null) {
    if (this._noTracking || !cwd || cwd === this.cwd_path) return false;

    this.cwd_path = cwd;
    if (cwd.startsWith("FALLBACK |-- ")) {
      this._noTracking = true;
      void this.readFS(cwd.slice(13));
    } else {
      void this.readFS(cwd);
    }

    return true;
  }

  toggleHidedotfiles() {
    if (settingsBool(window.settings, "hideDotfiles")) {
      this.container.classList.remove("hideDotfiles");
      window.settings.hideDotfiles = false;
    } else {
      this.container.classList.add("hideDotfiles");
      window.settings.hideDotfiles = true;
    }
  }

  toggleListview() {
    if (settingsBool(window.settings, "fsListView")) {
      this.container.classList.remove("list-view");
      window.settings.fsListView = false;
    } else {
      this.container.classList.add("list-view");
      window.settings.fsListView = true;
    }
  }

  async readFS(dir: string) {
    if (this.failed || this._reading) return false;
    this._reading = true;
    this.title.textContent = this.dirpath;
    this.filesContainer.className = "";
    this.filesContainer.replaceChildren();

    if (this._noTracking) {
      const label = this.container.querySelector("h3.title > p:first-of-type");
      if (label) label.textContent = "FILESYSTEM - TRACKING FAILED, RUNNING DETACHED FROM TTY";
    }

    try {
      const entries = await listFilesystemDirectory(dir);
      const blocks: DisplayBlock[] = entries.map((entry) => this.entryToBlock(entry));

      blocks.splice(0, 0, {
        name: "Show disks",
        entryType: "showDisks",
        category: "showDisks",
      });

      if (dir !== "/" && /^[A-Z]:\\$/i.test(dir) === false) {
        blocks.splice(1, 0, {
          name: "Go up",
          path: parentPath(dir),
          entryType: "up",
          category: "up",
        });
      }

      this.cwd = blocks;
      this.dirpath = dir;
      this.render(this.cwd);
      void this.reCalculateDiskUsage(dir);
      return true;
    } catch (error) {
      console.warn(error);
      this.setFailedState();
      return false;
    } finally {
      this._reading = false;
    }
  }

  async readDevices() {
    if (this.failed) return false;
    const devices = await listFilesystemDevices();
    this.render(devices.map((device) => this.deviceToBlock(device)), true);
    return true;
  }

  render(originBlockList: DisplayBlock[], isDiskView = false) {
    const blockList = JSON.parse(JSON.stringify(originBlockList)) as DisplayBlock[];

    if (this.failed) return false;

    if (isDiskView) {
      this.title.textContent = "Showing available block devices";
      this.filesContainer.className = "disks";
    } else {
      this.title.textContent = this.dirpath;
      this.filesContainer.className = "";
    }

    this.filesContainer.replaceChildren();

    blockList.forEach((block, blockIndex) => {
      const type = displayType(block);
      const icon = iconFor(block) || icons.other;
      const element = document.createElement("div");
      element.className = `fs_disp_${block.entryType}${block.hidden ? " hidden" : ""}`;
      element.addEventListener("click", () => this.activateBlock(blockIndex, block, isDiskView));

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", `0 0 ${icon?.width || 24} ${icon?.height || 24}`);
      svg.setAttribute("fill", this.iconcolor);
      svg.innerHTML = icon?.svg || "";

      const name = document.createElement("h3");
      name.textContent = block.name;

      const typeEl = document.createElement("h4");
      typeEl.textContent = type;

      const size = document.createElement("h4");
      size.textContent = typeof block.size === "number" ? formatBytes(block.size) : block.size || "--";

      const lastAccessed = document.createElement("h4");
      lastAccessed.textContent =
        typeof block.lastAccessed === "number" ? new Date(block.lastAccessed).toLocaleString() : block.lastAccessed || "--";

      element.append(svg, name, typeEl, size, lastAccessed);
      this.filesContainer.appendChild(element);
    });

    document.getElementById("fs_space_bar")?.addEventListener(
      "click",
      () => {
        if (this.filesContainer.className.endsWith("disks")) this.render(this.cwd);
      },
      { once: true },
    );

    return true;
  }

  async reCalculateDiskUsage(path: string) {
    this.spaceText.textContent = "Calculating available space...";
    this.spaceBar.removeAttribute("value");

    try {
      this.renderDiskUsage(await getFilesystemUsage(path));
    } catch (error) {
      console.warn(error);
      this.spaceText.textContent = "Could not calculate mountpoint usage.";
      this.spaceBar.value = 100;
    }
  }

  renderDiskUsage(fsBlock: FilesystemUsage | null) {
    if (this.filesContainer.className.endsWith("disks") || fsBlock === null) return;

    const splitter = fsBlock.mount.includes("\\") ? "\\" : "/";
    const displayMount = fsBlock.mount.length < 18 ? fsBlock.mount : `...${splitter}${fsBlock.mount.split(splitter).pop()}`;
    this.spaceText.innerHTML = `Mount <strong>${window._escapeHtml(displayMount)}</strong> used <strong>${Math.round(
      fsBlock.usedPercent,
    )}%</strong>`;
    this.spaceBar.value = Math.round(fsBlock.usedPercent);
  }

  openFile(index: number) {
    const block = this.cwd[index];
    if (block?.path) activeTerminal()?.write(quoteShellPath(block.path));
  }

  private entryToBlock(entry: FilesystemEntry): DisplayBlock {
    return {
      name: entry.name,
      path: entry.path,
      entryType: entry.entryType,
      category: entry.category,
      hidden: entry.hidden,
      size: entry.size,
      lastAccessed: entry.lastAccessed,
    };
  }

  private deviceToBlock(device: FilesystemDevice): DisplayBlock {
    return {
      name: device.name,
      path: device.path,
      entryType: device.entryType,
      category: "disk",
      size: device.totalSpace,
      lastAccessed: "--",
    };
  }

  private setFailedState() {
    this.failed = true;
    this.container.innerHTML = `
      <h3 class="title"><p>FILESYSTEM</p><p id="fs_disp_title_dir">EXECUTION FAILED</p></h3>
      <h2 id="fs_disp_error">CANNOT ACCESS CURRENT WORKING DIRECTORY</h2>`;
  }

  private activateBlock(index: number, block: DisplayBlock, isDiskView: boolean) {
    if (block.entryType === "showDisks") {
      void this.readDevices();
      return;
    }

    if (block.entryType === "up") {
      if (this._noTracking && block.path) void this.readFS(block.path);
      else activeTerminal()?.writelr("cd ..");
      return;
    }

    if (!block.path) return;

    const keyboardState = document.getElementById("keyboard")?.dataset;

    if (keyboardState?.isCtrlOn === "true") {
      void openPathExternal(block.path);
      return;
    }
    if (keyboardState?.isShiftOn === "true") {
      activeTerminal()?.write(quoteShellPath(block.path));
      return;
    }

    if (block.category === "dir" || block.entryType.endsWith("Dir")) {
      if (this._noTracking) void this.readFS(block.path);
      else activeTerminal()?.writelr(`cd ${quoteShellPath(block.name)}`);
    } else if (isDiskView || block.entryType === "disk" || block.entryType === "rom" || block.entryType === "usb") {
      if (this._noTracking) void this.readFS(block.path);
      else activeTerminal()?.writelr(`cd ${quoteShellPath(block.path)}`);
    } else if (block.entryType === "edex-theme") {
      window.themeChanger(block.name.replace(/\.json$/i, ""));
    } else if (block.entryType === "edex-kblayout") {
      void window.remakeKeyboard(block.name.replace(/\.json$/i, ""));
    } else if (block.entryType === "file") {
      this.openFile(index);
    } else {
      activeTerminal()?.write(quoteShellPath(block.path));
    }
  }
}

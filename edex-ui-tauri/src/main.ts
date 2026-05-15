import { invoke } from "@tauri-apps/api/core";
import enUsLayout from "./assets/kb_layouts/en-US.json";

type KeySpec = {
  name?: string;
  cmd?: string;
  shift_name?: string;
  fn_name?: string;
  alt_name?: string;
  altshift_name?: string;
};

type EdexPaths = {
  settingsDir: string;
  themesDir: string;
  keyboardsDir: string;
  fontsDir: string;
  settingsFile: string;
  shortcutsFile: string;
  lastWindowStateFile: string;
  versionHistoryFile: string;
};

type BootFlags = {
  nointroOverride: boolean;
  nocursorOverride: boolean;
  args: string[];
};

type AppMetadata = {
  version: string;
  packageName: string;
  productName: string;
  identifier: string;
  platform: string;
  arch: string;
};

type TerminalLaunchConfig = {
  shell: string;
  shellArgs: string;
  cwd: string;
  env: Record<string, string>;
  port: number;
};

type BootstrapConfig = {
  paths: EdexPaths;
  settings: Record<string, unknown>;
  shortcuts: Array<Record<string, unknown>>;
  lastWindowState: Record<string, unknown>;
  versionHistory: Record<string, unknown>;
  flags: BootFlags;
  metadata: AppMetadata;
  terminalLaunch: TerminalLaunchConfig;
};

declare global {
  interface Window {
    edexBoot?: BootstrapConfig;
  }
}

async function loadBootstrapConfig() {
  window.edexBoot = await invoke<BootstrapConfig>("get_bootstrap_config");
  console.info("Loaded eDEX config", {
    settingsDir: window.edexBoot.paths.settingsDir,
    version: window.edexBoot.metadata.version,
    shell: window.edexBoot.terminalLaunch.shell,
  });
}

function updateClock() {
  const clock = document.querySelector<HTMLElement>("#skeleton-clock");
  if (!clock) return;

  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  clock.innerHTML = `<span>${hours}</span><em>:</em><span>${minutes}</span>`;
}

function iconMarkup(name: string) {
  switch (name) {
    case "ARROW_UP":
      return `<svg viewBox="0 0 24.00 24.00"><path fill-opacity="1" d="m12.00004 7.99999 4.99996 5h-2.99996v4.00001h-4v-4.00001h-3z"/><path stroke-linejoin="round" fill-opacity="0.65" d="m4 3h16c1.1046 0 1-0.10457 1 1v16c0 1.1046 0.1046 1-1 1h-16c-1.10457 0-1 0.1046-1-1v-16c0-1.10457-0.10457-1 1-1zm0 1v16h16v-16z"/></svg>`;
    case "ARROW_LEFT":
      return `<svg viewBox="0 0 24.00 24.00"><path fill-opacity="1" d="m7.500015 12.499975 5-4.99996v2.99996h4.00001v4h-4.00001v3z"/><path stroke-linejoin="round" fill-opacity="0.65" d="m4 3h16c1.1046 0 1-0.10457 1 1v16c0 1.1046 0.1046 1-1 1h-16c-1.10457 0-1 0.1046-1-1v-16c0-1.10457-0.10457-1 1-1zm0 1v16h16v-16z"/></svg>`;
    case "ARROW_DOWN":
      return `<svg viewBox="0 0 24.00 24.00"><path fill-opacity="1" d="m12 17-4.99996-5h2.99996v-4.00001h4v4.00001h3z"/><path stroke-linejoin="round" fill-opacity="0.65" d="m4 3h16c1.1046 0 1-0.10457 1 1v16c0 1.1046 0.1046 1-1 1h-16c-1.10457 0-1 0.1046-1-1v-16c0-1.10457-0.10457-1 1-1zm0 1v16h16v-16z"/></svg>`;
    case "ARROW_RIGHT":
      return `<svg viewBox="0 0 24.00 24.00"><path fill-opacity="1" d="m16.500025 12.500015-5 4.99996v-2.99996h-4.00001v-4h4.00001v-3z"/><path stroke-linejoin="round" fill-opacity="0.65" d="m4 3h16c1.1046 0 1-0.10457 1 1v16c0 1.1046 0.1046 1-1 1h-16c-1.10457 0-1 0.1046-1-1v-16c0-1.10457-0.10457-1 1-1zm0 1v16h16v-16z"/></svg>`;
    default:
      return "";
  }
}

function keyMarkup(key: KeySpec) {
  if (key.cmd === "\r") return `<h1>${key.name || ""}</h1>`;

  const iconPrefix = "ESCAPED|-- ICON: ";
  if (key.name?.startsWith(iconPrefix)) {
    return iconMarkup(key.name.slice(iconPrefix.length));
  }

  return `
    <h5>${key.altshift_name || ""}</h5>
    <h4>${key.fn_name || ""}</h4>
    <h3>${key.alt_name || ""}</h3>
    <h2>${key.shift_name || ""}</h2>
    <h1>${key.name || ""}</h1>`;
}

function renderKeyboard() {
  const keyboard = document.querySelector<HTMLElement>("#keyboard");
  if (!keyboard) return;

  const layout = enUsLayout as Record<string, KeySpec[]>;
  keyboard.dataset.isShiftOn = "false";
  keyboard.dataset.isCapsLckOn = "false";
  keyboard.dataset.isAltOn = "false";
  keyboard.dataset.isCtrlOn = "false";
  keyboard.dataset.isFnOn = "false";
  keyboard.dataset.passwordMode = "false";

  for (const [rowName, rowKeys] of Object.entries(layout)) {
    const row = document.createElement("div");
    row.className = "keyboard_row";
    row.id = rowName;

    for (const keySpec of rowKeys) {
      const key = document.createElement("div");
      key.className = keySpec.cmd === "\r" ? "keyboard_key keyboard_enter" : "keyboard_key";
      if (keySpec.cmd === " ") key.id = "keyboard_spacebar";
      key.innerHTML = keyMarkup(keySpec);
      row.appendChild(key);
    }

    keyboard.appendChild(row);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  loadBootstrapConfig().catch((error) => {
    console.error("Failed to load eDEX config", error);
  });
  renderKeyboard();
  updateClock();
  window.setInterval(updateClock, 1000);
});

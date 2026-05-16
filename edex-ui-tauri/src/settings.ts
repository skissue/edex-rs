import {
  getMonitors,
  listKeyboardLayouts,
  listThemes,
  openPathExternal,
  writeSettings,
  type JsonObject,
  type ShortcutConfig,
} from "./backend";
import { Modal } from "./modal";
import type { TauriTerminal } from "./terminal";

type SettingRow = {
  key: string;
  description: string;
  kind: "text" | "number" | "boolean" | "select";
  options?: string[];
  fallback?: string | number | boolean;
};

function activeTerminal() {
  return window.term?.[window.currentTerm || 0] as TauriTerminal | undefined;
}

function escapeHtml(text: unknown) {
  return window._escapeHtml(String(text ?? ""));
}

function settingValue(key: string, fallback: string | number | boolean = "") {
  const value = window.settings[key];
  if (typeof value === "undefined" || value === null) return fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return value as string | number | boolean;
}

function optionTags(current: string | number | boolean, options: string[]) {
  const values = [String(current), ...options.filter((option) => option !== String(current))];
  return values.map((value) => `<option>${escapeHtml(value)}</option>`).join("");
}

function inputFor(row: SettingRow) {
  const value = settingValue(row.key, row.fallback ?? "");
  const id = `settingsEditor-${row.key}`;

  if (row.kind === "boolean") {
    return `<select id="${id}">
      <option>${String(value === true || value === "true")}</option>
      <option>${String(!(value === true || value === "true"))}</option>
    </select>`;
  }

  if (row.kind === "select") {
    return `<select id="${id}">${optionTags(value, row.options || [])}</select>`;
  }

  return `<input type="${row.kind}" id="${id}" value="${escapeHtml(value)}">`;
}

function readInput(id: string) {
  return document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
}

function readString(key: string) {
  return readInput(`settingsEditor-${key}`)?.value || "";
}

function readNumber(key: string) {
  const value = Number(readString(key));
  return Number.isNaN(value) ? 0 : value;
}

function readBool(key: string) {
  return readString(key) === "true";
}

function readEnv() {
  const raw = readString("env");
  if (!raw || raw === "undefined") return undefined;
  try {
    return JSON.parse(raw) as JsonObject;
  } catch {
    return raw;
  }
}

export async function openSettings() {
  if (document.getElementById("settingsEditor")) return;

  const [keyboards, themes, monitors] = await Promise.all([listKeyboardLayouts(), listThemes(), getMonitors().catch(() => [])]);
  const monitorOptions = monitors.map((_monitor, index) => String(index));
  const currentMonitor =
    typeof window.settings.monitor === "number" || typeof window.settings.monitor === "string" ? window.settings.monitor : "";

  const rows: SettingRow[] = [
    { key: "shell", description: "The program to run as a terminal emulator", kind: "text" },
    { key: "shellArgs", description: "Arguments to pass to the shell", kind: "text" },
    { key: "cwd", description: "Working Directory to start in", kind: "text" },
    { key: "env", description: "Custom shell environment override", kind: "text" },
    { key: "username", description: "Custom username to display at boot", kind: "text" },
    { key: "keyboard", description: "On-screen keyboard layout code", kind: "select", options: keyboards },
    { key: "theme", description: "Name of the theme to load", kind: "select", options: themes },
    { key: "termFontSize", description: "Size of the terminal text in pixels", kind: "number" },
    { key: "audio", description: "Activate audio sound effects", kind: "boolean" },
    { key: "audioVolume", description: "Set default volume for sound effects (0.0 - 1.0)", kind: "number", fallback: 1.0 },
    { key: "disableFeedbackAudio", description: "Disable recurring feedback sound FX (input/output, mostly)", kind: "boolean" },
    { key: "port", description: "Local port to use for UI-shell connection", kind: "number" },
    { key: "pingAddr", description: "IPv4 address to test Internet connectivity", kind: "text", fallback: "1.1.1.1" },
    { key: "clockHours", description: "Clock format (12/24 hours)", kind: "select", options: ["12", "24"] },
    { key: "monitor", description: "Which monitor to spawn the UI in (defaults to primary display)", kind: "select", options: monitorOptions, fallback: currentMonitor },
    { key: "nointro", description: "Skip the intro boot log and logo", kind: "boolean" },
    { key: "nocursor", description: "Hide the mouse cursor", kind: "boolean" },
    { key: "iface", description: "Override the interface used for network monitoring", kind: "text" },
    { key: "allowWindowed", description: "Allow using F11 key to set the UI in windowed mode", kind: "boolean" },
    { key: "keepGeometry", description: "Try to keep a 16:9 aspect ratio in windowed mode", kind: "boolean", fallback: true },
    { key: "excludeThreadsFromToplist", description: "Display threads in the top processes list", kind: "boolean" },
    { key: "hideDotfiles", description: "Hide files and directories starting with a dot in file display", kind: "boolean" },
    { key: "fsListView", description: "Show files in a more detailed list instead of an icon grid", kind: "boolean" },
    { key: "experimentalGlobeFeatures", description: "Toggle experimental features for the network globe", kind: "boolean" },
    { key: "experimentalFeatures", description: "Toggle Chrome's experimental web features (DANGEROUS)", kind: "boolean" },
  ];

  window.keyboard?.detach();

  new Modal(
    {
      type: "custom",
      title: `Settings (v${window.edexBoot?.metadata.version || "0.0.0"})`,
      html: `<table id="settingsEditor">
        <tr>
          <th>Key</th>
          <th>Description</th>
          <th>Value</th>
        </tr>
        ${rows
          .map(
            (row) => `<tr>
              <td>${escapeHtml(row.key)}</td>
              <td>${escapeHtml(row.description)}</td>
              <td>${inputFor(row)}</td>
            </tr>`,
          )
          .join("")}
      </table>
      <h6 id="settingsEditorStatus">Loaded values from memory</h6>
      <br>`,
      buttons: [
        {
          label: "Open in External Editor",
          action: () => {
            const path = window.edexBoot?.paths.settingsFile;
            if (path) void openPathExternal(path);
          },
        },
        { label: "Save to Disk", action: () => void writeSettingsFile() },
        { label: "Reload UI", action: () => window.location.reload() },
      ],
    },
    () => {
      window.keyboard?.attach();
      activeTerminal()?.term.focus();
    },
  );
}

export async function writeSettingsFile() {
  const nextSettings: JsonObject = {
    shell: readString("shell"),
    shellArgs: readString("shellArgs"),
    cwd: readString("cwd"),
    env: readEnv(),
    username: readString("username"),
    keyboard: readString("keyboard"),
    theme: readString("theme"),
    termFontSize: readNumber("termFontSize"),
    audio: readBool("audio"),
    audioVolume: readNumber("audioVolume"),
    disableFeedbackAudio: readBool("disableFeedbackAudio"),
    pingAddr: readString("pingAddr"),
    clockHours: readNumber("clockHours"),
    port: readNumber("port"),
    monitor: readNumber("monitor"),
    nointro: readBool("nointro"),
    nocursor: readBool("nocursor"),
    iface: readString("iface"),
    allowWindowed: readBool("allowWindowed"),
    forceFullscreen: window.settings.forceFullscreen,
    keepGeometry: readBool("keepGeometry"),
    excludeThreadsFromToplist: readBool("excludeThreadsFromToplist"),
    hideDotfiles: readBool("hideDotfiles"),
    fsListView: readBool("fsListView"),
    experimentalGlobeFeatures: readBool("experimentalGlobeFeatures"),
    experimentalFeatures: readBool("experimentalFeatures"),
  };

  Object.keys(nextSettings).forEach((key) => {
    if (nextSettings[key] === "undefined" || typeof nextSettings[key] === "undefined") delete nextSettings[key];
  });

  const boot = await writeSettings(nextSettings);
  window.edexBoot = boot;
  window.settings = boot.settings;

  const status = document.getElementById("settingsEditorStatus");
  if (status) status.textContent = `New values written to settings.json file at ${new Date().toTimeString()}`;
}

export function openShortcutsHelp() {
  if (document.getElementById("settingsEditor")) return;

  const shortcutsDefinition: Record<string, string> = {
    COPY: "Copy selected buffer from the terminal.",
    PASTE: "Paste system clipboard to the terminal.",
    NEXT_TAB: "Switch to the next opened terminal tab (left to right order).",
    PREVIOUS_TAB: "Switch to the previous opened terminal tab (right to left order).",
    TAB_X: "Switch to terminal tab X, or create it if it hasn't been opened yet.",
    SETTINGS: "Open the settings editor.",
    SHORTCUTS: "List and edit available keyboard shortcuts.",
    FUZZY_SEARCH: "Search for entries in the current working directory.",
    FS_LIST_VIEW: "Toggle between list and grid view in the file browser.",
    FS_DOTFILES: "Toggle hidden files and directories in the file browser.",
    KB_PASSMODE: "Toggle the on-screen keyboard's Password Mode.",
    DEV_DEBUG: "Open Chromium Dev Tools, for debugging purposes.",
    DEV_RELOAD: "Trigger front-end hot reload.",
  };

  const appList = window.shortcuts
    .filter((shortcut) => shortcut.type === "app")
    .map((shortcut) => shortcutRow(shortcut, shortcutsDefinition))
    .join("");

  const customList = window.shortcuts
    .filter((shortcut) => shortcut.type === "shell")
    .map(
      (shortcut) => `<tr>
        <td>${shortcut.enabled ? "YES" : "NO"}</td>
        <td><input disabled type="text" maxlength=25 value="${escapeHtml(shortcut.trigger)}"></td>
        <td>
          <input disabled type="text" placeholder="Run terminal command..." value="${escapeHtml(shortcut.action)}">
          <input disabled type="checkbox" name="shortcutsHelpNew_Enter" ${shortcut.linebreak ? "checked" : ""}>
          <label for="shortcutsHelpNew_Enter">Enter</label>
        </td>
      </tr>`,
    )
    .join("");

  window.keyboard?.detach();
  new Modal(
    {
      type: "custom",
      title: `Available Keyboard Shortcuts (v${window.edexBoot?.metadata.version || "0.0.0"})`,
      html: `<h5>Using either the on-screen or a physical keyboard, you can use the following shortcuts:</h5>
        <details open id="shortcutsHelpAccordeon1">
          <summary>Emulator shortcuts</summary>
          <table class="shortcutsHelp">
            <tr><th>Enabled</th><th>Trigger</th><th>Action</th></tr>
            ${appList}
          </table>
        </details>
        <br>
        <details id="shortcutsHelpAccordeon2">
          <summary>Custom command shortcuts</summary>
          <table class="shortcutsHelp">
            <tr><th>Enabled</th><th>Trigger</th><th>Command</th></tr>
            ${customList}
          </table>
        </details>
        <br>`,
      buttons: [
        {
          label: "Open Shortcuts File",
          action: () => {
            const path = window.edexBoot?.paths.shortcutsFile;
            if (path) void openPathExternal(path);
          },
        },
        { label: "Reload UI", action: () => window.location.reload() },
      ],
    },
    () => {
      window.keyboard?.attach();
      activeTerminal()?.term.focus();
    },
  );

  const wrap1 = document.getElementById("shortcutsHelpAccordeon1") as HTMLDetailsElement | null;
  const wrap2 = document.getElementById("shortcutsHelpAccordeon2") as HTMLDetailsElement | null;
  wrap1?.addEventListener("toggle", () => {
    if (wrap2) wrap2.open = !wrap1.open;
  });
  wrap2?.addEventListener("toggle", () => {
    if (wrap1) wrap1.open = !wrap2.open;
  });
}

function shortcutRow(shortcut: ShortcutConfig, shortcutsDefinition: Record<string, string>) {
  const action = shortcut.action.startsWith("TAB_") ? "TAB_X" : shortcut.action;
  return `<tr>
    <td>${shortcut.enabled ? "YES" : "NO"}</td>
    <td><input disabled type="text" maxlength=25 value="${escapeHtml(shortcut.trigger)}"></td>
    <td>${escapeHtml(shortcutsDefinition[action] || shortcut.action)}</td>
  </tr>`;
}

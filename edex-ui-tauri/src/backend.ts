import { invoke } from "@tauri-apps/api/core";

export type JsonObject = Record<string, unknown>;

export type EdexPaths = {
  settingsDir: string;
  themesDir: string;
  keyboardsDir: string;
  fontsDir: string;
  settingsFile: string;
  shortcutsFile: string;
  lastWindowStateFile: string;
  versionHistoryFile: string;
};

export type BootFlags = {
  nointroOverride: boolean;
  nocursorOverride: boolean;
  args: string[];
};

export type AppMetadata = {
  version: string;
  packageName: string;
  productName: string;
  identifier: string;
  platform: string;
  arch: string;
};

export type TerminalLaunchConfig = {
  shell: string;
  shellArgs: string;
  cwd: string;
  env: Record<string, string>;
  port: number;
};

export type TerminalSessionInfo = {
  id: number;
  pid: number | null;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
};

export type TerminalDataEvent = {
  id: number;
  data: string;
};

export type TerminalExitEvent = {
  id: number;
  code: number;
  signal: string | null;
};

export type ShortcutConfig = {
  trigger: string;
  type: "app" | "shell" | string;
  action: string;
  enabled?: boolean;
  linebreak?: boolean;
};

export type BootstrapConfig = {
  paths: EdexPaths;
  settings: JsonObject;
  shortcuts: ShortcutConfig[];
  lastWindowState: JsonObject;
  versionHistory: JsonObject;
  flags: BootFlags;
  metadata: AppMetadata;
  terminalLaunch: TerminalLaunchConfig;
};

export type ThemeConfig = {
  cssvars: {
    font_main: string;
    font_main_light: string;
  };
  terminal: {
    fontFamily: string;
    [key: string]: unknown;
  };
  colors: {
    r: string | number;
    g: string | number;
    b: string | number;
    black: string;
    light_black: string;
    grey: string;
    red?: string;
    yellow?: string;
    [key: string]: unknown;
  };
  injectCSS?: string;
  [key: string]: unknown;
};

export type KeySpec = {
  name?: string;
  cmd?: string;
  shift_name?: string;
  shift_cmd?: string;
  fn_name?: string;
  fn_cmd?: string;
  alt_name?: string;
  alt_cmd?: string;
  altshift_name?: string;
  altshift_cmd?: string;
  ctrl_cmd?: string;
  capslck_cmd?: string;
  [key: string]: string | undefined;
};

export type KeyboardLayout = Record<string, KeySpec[]>;

export type PlatformInfo = {
  os: string;
  arch: string;
  family: string;
  exeExtension: string;
};

export type MonitorInfo = {
  name: string | null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
};

export function getBootstrapConfig() {
  return invoke<BootstrapConfig>("get_bootstrap_config");
}

export function readTheme(name: string) {
  return invoke<ThemeConfig>("read_theme", { name });
}

export function readKeyboardLayout(name: string) {
  return invoke<KeyboardLayout>("read_keyboard_layout", { name });
}

export function listThemes() {
  return invoke<string[]>("list_themes");
}

export function listKeyboardLayouts() {
  return invoke<string[]>("list_keyboard_layouts");
}

export function getThemeOverride() {
  return invoke<string | null>("get_theme_override");
}

export function setThemeOverride(theme: string | null) {
  return invoke<void>("set_theme_override", { theme });
}

export function getKeyboardOverride() {
  return invoke<string | null>("get_keyboard_override");
}

export function setKeyboardOverride(layout: string | null) {
  return invoke<void>("set_keyboard_override", { layout });
}

export function writeSettings(settings: JsonObject) {
  return invoke<void>("write_settings", { settings });
}

export function writeLastWindowState(state: JsonObject) {
  return invoke<void>("write_last_window_state", { state });
}

export function prepareTerminalEnvironment(settings: JsonObject) {
  return invoke<TerminalLaunchConfig>("prepare_terminal_environment", { settings });
}

export function spawnTerminal(settings: JsonObject, cols = 80, rows = 24) {
  return invoke<TerminalSessionInfo>("spawn_terminal", {
    request: {
      settings,
      cols,
      rows,
    },
  });
}

export function writeTerminal(id: number, data: string) {
  return invoke<void>("write_terminal", { id, data });
}

export function resizeTerminal(id: number, cols: number, rows: number) {
  return invoke<void>("resize_terminal", { id, cols, rows });
}

export function killTerminal(id: number) {
  return invoke<void>("kill_terminal", { id });
}

export function getPlatformInfo() {
  return invoke<PlatformInfo>("get_platform_info");
}

export function getMonitors() {
  return invoke<MonitorInfo[]>("get_monitors");
}

export function logMessage(level: string, message: string) {
  return invoke<void>("log_message", { level, message });
}

export function openDevtools() {
  return invoke<void>("open_devtools");
}

export function quitApp() {
  return invoke<void>("quit_app");
}

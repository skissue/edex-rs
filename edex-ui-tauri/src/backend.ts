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

export type TerminalCwdEvent = {
  id: number;
  cwd: string;
};

export type TerminalExitEvent = {
  id: number;
  code: number;
  signal: string | null;
};

export type FilesystemEntry = {
  name: string;
  path: string;
  entryType: string;
  category: string;
  hidden: boolean;
  size: number | null;
  lastAccessed: number | null;
};

export type FilesystemDevice = {
  name: string;
  path: string;
  entryType: string;
  totalSpace: number;
  availableSpace: number;
};

export type FilesystemUsage = {
  name: string;
  mount: string;
  totalSpace: number;
  availableSpace: number;
  usedSpace: number;
  usedPercent: number;
};

export type BatteryInfo = {
  hasBattery: boolean;
  percent: number | null;
  isCharging: boolean;
  acConnected: boolean;
};

export type SysinfoSnapshot = {
  os: string;
  uptime: number;
  battery: BatteryInfo;
};

export type HardwareIdentity = {
  manufacturer: string;
  model: string;
  chassis: string;
};

export type CpuMetrics = {
  vendor: string;
  brand: string;
  cores: number;
  speedGhz: number;
  speedMaxGhz: number;
  temperatureCelsius: number | null;
  loads: number[];
  tasks: number;
};

export type MemoryMetrics = {
  total: number;
  free: number;
  used: number;
  active: number;
  available: number;
  swapTotal: number;
  swapUsed: number;
};

export type ProcessMetrics = {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
};

export type NetworkInterfaceInfo = {
  iface: string;
  ip4: string;
  mac: string;
  operstate: string;
  internal: boolean;
};

export type NetworkStatus = {
  iface: string | null;
  ip4: string | null;
  displayIp4: string | null;
  online: boolean;
  pingMs: number | null;
  interfaces: NetworkInterfaceInfo[];
};

export type NetworkStatsInfo = {
  iface: string;
  rxBytes: number;
  txBytes: number;
  rxSec: number;
  txSec: number;
};

export type SystemMetrics = {
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  processes: ProcessMetrics[];
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
  terminalLaunchError: string | null;
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
  index: number;
  name: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  workX: number;
  workY: number;
  workWidth: number;
  workHeight: number;
  scaleFactor: number;
  primary: boolean;
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
  return invoke<BootstrapConfig>("write_settings", { settings });
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

export function killAllTerminals() {
  return invoke<number>("kill_all_terminals");
}

export function getPlatformInfo() {
  return invoke<PlatformInfo>("get_platform_info");
}

export function getSysinfoSnapshot() {
  return invoke<SysinfoSnapshot>("get_sysinfo_snapshot");
}

export function getHardwareIdentity() {
  return invoke<HardwareIdentity>("get_hardware_identity");
}

export function getSystemMetrics() {
  return invoke<SystemMetrics>("get_system_metrics");
}

export function getCpuMetrics() {
  return invoke<CpuMetrics>("get_cpu_metrics");
}

export function getMemoryMetrics() {
  return invoke<MemoryMetrics>("get_memory_metrics");
}

export function getProcessMetrics() {
  return invoke<ProcessMetrics[]>("get_process_metrics");
}

export function getNetworkStatus(iface?: string, pingAddr?: string) {
  return invoke<NetworkStatus>("get_network_status", {
    iface: iface || null,
    pingAddr: pingAddr || null,
  });
}

export function getNetworkStats(iface: string) {
  return invoke<NetworkStatsInfo | null>("get_network_stats", { iface });
}

export function getMonitors() {
  return invoke<MonitorInfo[]>("get_monitors");
}

export function listFilesystemDirectory(path: string) {
  return invoke<FilesystemEntry[]>("list_filesystem_directory", { path });
}

export function listFilesystemDevices() {
  return invoke<FilesystemDevice[]>("list_filesystem_devices");
}

export function getFilesystemUsage(path: string) {
  return invoke<FilesystemUsage | null>("get_filesystem_usage", { path });
}

export function openPathExternal(path: string) {
  return invoke<void>("open_path_external", { path });
}

export function logMessage(level: string, message: string) {
  return invoke<void>("log_message", { level, content: message });
}

export function openDevtools() {
  return invoke<void>("open_devtools");
}

export function quitApp() {
  return invoke<void>("quit_app");
}

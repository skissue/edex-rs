import {
  getBootstrapConfig,
  getKeyboardOverride,
  getThemeOverride,
  logMessage,
  openDevtools,
  readKeyboardLayout,
  readTheme,
  setKeyboardOverride,
  setThemeOverride,
  type BootstrapConfig,
  type JsonObject,
  type ShortcutConfig,
  type ThemeConfig,
} from "./backend";
import type { FilesystemDisplay } from "./filesystem";
import { FuzzyFinder } from "./fuzzyFinder";
import { Keyboard } from "./keyboard";
import { openSettings, openShortcutsHelp, writeSettingsFile } from "./settings";
import type { TauriTerminal } from "./terminal";
import bootLogText from "./assets/misc/boot_log.txt?raw";

declare global {
  interface Window {
    edexBoot?: BootstrapConfig;
    settings: JsonObject;
    shortcuts: BootstrapConfig["shortcuts"];
    lastWindowState: JsonObject;
    theme?: ThemeConfig & { r: string | number; g: string | number; b: string | number };
    _escapeHtml: (text: string) => string;
    _encodePathURI: (uri: string) => string;
    _purifyCSS: (value: unknown) => string;
    _delay: (ms: number) => Promise<void>;
    _loadTheme: (theme: ThemeConfig) => void;
    themeChanger: (theme: string) => void;
    remakeKeyboard: (layout: string) => void | Promise<void>;
    openSettings: () => void | Promise<void>;
    openShortcutsHelp: () => void;
    writeSettingsFile: () => void | Promise<void>;
    fsDisp?: FilesystemDisplay;
    activeFuzzyFinder?: FuzzyFinder;
    mods: Record<string, unknown>;
    useAppShortcut: (action: string) => boolean;
    focusShellTab: (number: number) => void;
    registerKeyboardShortcuts: () => void;
    si: Record<string, (...args: unknown[]) => Promise<unknown>>;
  }
}

window.settings = {};
window.shortcuts = [];
window.lastWindowState = {};
window.mods = {};
window.currentTerm = 0;
window.term = {};

let mainTerminal: TauriTerminal | null = null;
let resizeFrame: number | null = null;
let terminalClassPromise: Promise<typeof TauriTerminal> | null = null;
let filesystemClassPromise: Promise<typeof FilesystemDisplay> | null = null;
let registeredShortcuts: ShortcutConfig[] = [];
const MAX_TERMINALS = 5;

window.eval = () => {
  throw new Error("eval() is disabled for security reasons.");
};

window._escapeHtml = (text: string) => {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (match) => map[match]);
};

window._encodePathURI = (uri: string) => encodeURI(uri).replace(/#/g, "%23");

window._purifyCSS = (value: unknown) => {
  if (typeof value === "undefined") return "";
  return String(value).replace(/[<]/g, "");
};

window._delay = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

function settingAsString(key: string, fallback: string) {
  const value = window.settings[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function initAudioManagerProxy() {
  let audioManagerPromise: Promise<Record<string, { play: () => void } | undefined>> | null = null;
  const loadAudioManager = () => {
    audioManagerPromise ||= import("./audioManager")
      .then(({ AudioManager }) => new AudioManager() as unknown as Record<string, { play: () => void } | undefined>)
      .catch((error) => {
        console.warn("Failed to initialize audio manager", error);
        return {};
      });
    return audioManagerPromise;
  };

  window.audioManager = new Proxy(
    {},
    {
      get: (_target, sound: string) => ({
        play: () => {
          void loadAudioManager().then((manager) => manager[sound]?.play());
        },
      }),
    },
  );
}

function bootDelayForLine(index: number, total: number) {
  if (index === 2 || index === 4) return 500;
  if (index > 4 && index < 25) return 30;
  if (index === 25) return 400;
  if (index === 42) return 300;
  if (index > 42 && index < 82) return 25;
  if (index === 83) return 25;
  if (index >= total - 2 && index < total) return 300;
  return Math.pow(1 - index / 1000, 3) * 25;
}

function ensureBootScreen() {
  let bootScreen = document.getElementById("boot_screen");
  if (!bootScreen) {
    bootScreen = document.createElement("section");
    bootScreen.id = "boot_screen";
    document.body.prepend(bootScreen);
  }
  return bootScreen;
}

async function displayBootLog() {
  const bootScreen = ensureBootScreen();
  const log = bootLogText.split("\n");

  bootScreen.className = "";
  bootScreen.innerHTML = "";
  document.body.classList.add("solidBackground", "booting");

  for (let index = 0; index < log.length; index += 1) {
    const line = log[index];
    if (line === "Boot Complete") window.audioManager?.granted?.play();
    else window.audioManager?.stdout?.play();

    bootScreen.innerHTML += `${line}<br/>`;

    const nextIndex = index + 1;
    if (nextIndex === 2) {
      bootScreen.innerHTML += `eDEX-UI Kernel version ${window.edexBoot?.metadata.version || "0.0.0"} boot at ${new Date().toString()}; root:xnu-1699.22.73~1/RELEASE_X86_64<br/>`;
    }

    await window._delay(bootDelayForLine(nextIndex, log.length));
  }

  await window._delay(300);
}

async function displayTitleScreen() {
  const bootScreen = ensureBootScreen();
  bootScreen.innerHTML = "";

  await window._delay(400);

  document.body.classList.remove("solidBackground");
  bootScreen.className = "center";
  window.audioManager?.theme?.play();
  bootScreen.innerHTML = "<h1>eDEX-UI</h1>";
  const title = bootScreen.querySelector("h1");
  if (!title) return;

  await window._delay(200);

  document.body.classList.add("solidBackground");

  await window._delay(100);

  title.setAttribute(
    "style",
    `background-color: rgb(${window.theme?.r}, ${window.theme?.g}, ${window.theme?.b});border-bottom: 5px solid rgb(${window.theme?.r}, ${window.theme?.g}, ${window.theme?.b});`,
  );

  await window._delay(300);

  title.setAttribute("style", `border: 5px solid rgb(${window.theme?.r}, ${window.theme?.g}, ${window.theme?.b});`);

  await window._delay(100);

  title.setAttribute("style", "");
  title.className = "glitch";

  await window._delay(500);

  document.body.classList.remove("solidBackground");
  title.className = "";
  title.setAttribute("style", `border: 5px solid rgb(${window.theme?.r}, ${window.theme?.g}, ${window.theme?.b});`);

  await window._delay(1000);
  bootScreen.remove();
}

async function displayStartupIntro() {
  await displayBootLog();
  await displayTitleScreen();
}

function fontUrl(fontName: string) {
  const fileName = fontName.toLowerCase().replace(/ /g, "_");
  return `/src/assets/fonts/${fileName}.woff2`;
}

window._loadTheme = (theme: ThemeConfig) => {
  document.querySelector("style.theming")?.remove();

  const mainFont = new FontFace(theme.cssvars.font_main, `url("${fontUrl(theme.cssvars.font_main)}")`);
  const lightFont = new FontFace(theme.cssvars.font_main_light, `url("${fontUrl(theme.cssvars.font_main_light)}")`);
  const termFont = new FontFace(theme.terminal.fontFamily, `url("${fontUrl(theme.terminal.fontFamily)}")`);

  document.fonts.add(mainFont);
  document.fonts.load(`12px ${theme.cssvars.font_main}`).catch(() => undefined);
  document.fonts.add(lightFont);
  document.fonts.load(`12px ${theme.cssvars.font_main_light}`).catch(() => undefined);
  document.fonts.add(termFont);
  document.fonts.load(`12px ${theme.terminal.fontFamily}`).catch(() => undefined);

  const hideCursor = window.settings.nocursorOverride || window.settings.nocursor;
  const style = document.createElement("style");
  style.className = "theming";
  style.textContent = `
    :root {
        --font_main: "${window._purifyCSS(theme.cssvars.font_main)}";
        --font_main_light: "${window._purifyCSS(theme.cssvars.font_main_light)}";
        --font_mono: "${window._purifyCSS(theme.terminal.fontFamily)}";
        --color_r: ${window._purifyCSS(theme.colors.r)};
        --color_g: ${window._purifyCSS(theme.colors.g)};
        --color_b: ${window._purifyCSS(theme.colors.b)};
        --color_black: ${window._purifyCSS(theme.colors.black)};
        --color_light_black: ${window._purifyCSS(theme.colors.light_black)};
        --color_grey: ${window._purifyCSS(theme.colors.grey)};
        --color_red: ${window._purifyCSS(theme.colors.red) || "red"};
        --color_yellow: ${window._purifyCSS(theme.colors.yellow) || "yellow"};
    }

    body {
        font-family: var(--font_main), sans-serif;
        cursor: ${hideCursor ? "none" : "default"} !important;
    }

    * {
        ${hideCursor ? "cursor: none !important;" : ""}
    }

    ${window._purifyCSS(theme.injectCSS || "")}
    `;
  document.head.appendChild(style);

  window.theme = {
    ...theme,
    r: theme.colors.r,
    g: theme.colors.g,
    b: theme.colors.b,
  };
};

function initGraphicalErrorHandling() {
  window.onerror = (message, source, line, column, error) => {
    const detail = `${String(error || "Error")}: ${String(message)}`;
    console.error(detail, source, line, column);
    showStartupError("Renderer error", detail);
    logMessage("error", detail).catch((logError) => {
      console.error("Failed to write renderer error to backend log", logError);
    });
  };

  window.onunhandledrejection = (event) => {
    const detail = event.reason instanceof Error ? event.reason.stack || event.reason.message : String(event.reason);
    console.error("Unhandled renderer rejection", event.reason);
    showStartupError("Unhandled renderer rejection", detail);
    logMessage("error", `Unhandled renderer rejection: ${detail}`).catch((logError) => {
      console.error("Failed to write renderer rejection to backend log", logError);
    });
  };
}

function showStartupError(title: string, error: unknown) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  const terminal = document.getElementById("terminal0");
  if (terminal) {
    terminal.textContent = `${title}\n\n${message}`;
  }
  setShellTabText(0, "ERROR");
}

function logStartupError(title: string, error: unknown) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(title, error);
  showStartupError(title, message);
  void logMessage("error", `${title}: ${message}`).catch((logError) => {
    console.error("Failed to write startup error to backend log", logError);
  });
}

function initSystemInformationProxy() {
  window.si = new Proxy(
    {},
    {
      apply: () => {
        throw new Error("Cannot use sysinfo proxy directly as a function");
      },
      set: () => {
        throw new Error("Cannot set a property on the sysinfo proxy");
      },
      get: (_target, property) => {
        return (...args: unknown[]) =>
          Promise.reject(new Error(`systeminformation.${String(property)} is not ported yet (${args.length} args)`));
      },
    },
  ) as Window["si"];
}

function waitForFonts() {
  const fontsReady = new Promise<void>((resolve) => {
    if (document.readyState === "complete" && document.fonts.status === "loaded") {
      resolve();
      return;
    }

    const resolveWhenLoaded = () => {
      if (document.fonts.status === "loaded") {
        resolve();
      } else {
        document.fonts.onloadingdone = () => resolve();
      }
    };

    if (document.readyState === "complete") {
      resolveWhenLoaded();
    } else {
      document.addEventListener("readystatechange", () => {
        if (document.readyState === "complete") resolveWhenLoaded();
      });
    }
  });

  return Promise.race([
    fontsReady,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1500);
    }),
  ]);
}

function activeTerminal() {
  return window.term?.[window.currentTerm || 0] as TauriTerminal | undefined;
}

function loadTerminalClass() {
  terminalClassPromise ??= import("./terminal").then((module) => module.TauriTerminal);
  return terminalClassPromise;
}

function loadFilesystemClass() {
  filesystemClassPromise ??= import("./filesystem").then((module) => module.FilesystemDisplay);
  return filesystemClassPromise;
}

function setShellTabText(number: number, text: string) {
  const tab = document.getElementById(`shell_tab${number}`);
  if (!tab) return;
  tab.replaceChildren(document.createElement("p"));
  tab.querySelector("p")!.textContent = text;
}

function setActiveShellTab(number: number) {
  document.querySelectorAll("ul#main_shell_tabs > li").forEach((tab) => tab.classList.remove("active"));
  document.getElementById(`shell_tab${number}`)?.classList.add("active");

  document.querySelectorAll("div#main_shell_innercontainer > pre").forEach((terminal) => terminal.classList.remove("active"));
  document.getElementById(`terminal${number}`)?.classList.add("active");
  window.currentTerm = number;
}

function terminalSettings(number: number) {
  const settings = { ...window.settings };
  const cwd = activeTerminal()?.cwd;
  if (number > 0 && cwd) settings.cwd = cwd;
  return settings;
}

async function createTerminal(number: number) {
  if (!window.theme) throw new Error("theme must be loaded before terminal initialization");
  if (number < 0 || number >= MAX_TERMINALS) return;
  if (window.term?.[number]) {
    setActiveShellTab(number);
    activeTerminal()?.scheduleFit();
    activeTerminal()?.term.focus();
    activeTerminal()?.resendCWD();
    return;
  }

  setShellTabText(number, number === 0 ? "MAIN SHELL" : "LOADING...");
  const TerminalClass = await loadTerminalClass();
  const term = new TerminalClass({
    parentId: `terminal${number}`,
    settings: terminalSettings(number),
    theme: window.theme,
  });

  term.oncwdchange = (cwd) => {
    if (window.currentTerm !== number || !cwd) return;
    window.fsDisp?.handleCwd(cwd);
  };
  term.onprocesschange = (processName) => {
    setShellTabText(number, number === 0 ? `MAIN - ${processName || "PTY"}` : `#${number + 1} - ${processName || "PTY"}`);
  };
  term.onclose = () => {
    if (number === 0) {
      setShellTabText(number, "MAIN - EXITED");
      return;
    }

    term.dispose().catch((error) => console.error("Failed to dispose closed terminal", error));
    delete window.term?.[number];
    setShellTabText(number, "EMPTY");
    document.getElementById(`terminal${number}`)?.replaceChildren();
    if (window.currentTerm === number) window.useAppShortcut("PREVIOUS_TAB");
  };

  window.term = { ...(window.term || {}), [number]: term };
  setActiveShellTab(number);

  try {
    const session = await term.start();
    setShellTabText(number, number === 0 ? `MAIN - ${session.pid ?? "PTY"}` : `#${number + 1} - ${session.pid ?? "PTY"}`);
    term.scheduleFit();
    term.resendCWD();
  } catch (error) {
    delete window.term?.[number];
    setShellTabText(number, "ERROR");
    term.dispose().catch(() => undefined);
    throw error;
  }
}

async function loadBootstrapConfig() {
  const boot = await getBootstrapConfig();
  const themeOverride = await getThemeOverride();
  const keyboardOverride = await getKeyboardOverride();

  window.edexBoot = boot;
  window.settings = boot.settings;
  window.shortcuts = boot.shortcuts;
  window.lastWindowState = boot.lastWindowState;
  window.settings.nointroOverride = boot.flags.nointroOverride || themeOverride !== null || keyboardOverride !== null;
  window.settings.nocursorOverride = boot.flags.nocursorOverride;

  if (themeOverride !== null) window.settings.theme = themeOverride;
  if (keyboardOverride !== null) window.settings.keyboard = keyboardOverride;

  window._loadTheme(await readTheme(settingAsString("theme", "tron")));
  initAudioManagerProxy();
  initSystemInformationProxy();

  if (boot.terminalLaunchError) {
    console.warn("Terminal launch config is invalid", boot.terminalLaunchError);
    void logMessage("warn", `Terminal launch config is invalid: ${boot.terminalLaunchError}`).catch((error) => {
      console.error("Failed to log terminal launch config warning", error);
    });
  }

  console.info("Loaded eDEX config", {
    settingsDir: boot.paths.settingsDir,
    version: boot.metadata.version,
    shell: boot.terminalLaunch.shell,
    theme: window.settings.theme,
    keyboard: window.settings.keyboard,
  });
}

async function initTerminalBackend() {
  await createTerminal(0);
  mainTerminal = window.term?.[0] as TauriTerminal | null;

  window.addEventListener("beforeunload", () => {
    void mainTerminal?.shutdownBackend();
  });
}

async function initFilesystemDisplay() {
  const FilesystemClass = await loadFilesystemClass();
  window.fsDisp = new FilesystemClass({
    parentId: "filesystem",
  });
}

function updateClock() {
  const clock = document.querySelector<HTMLElement>("#mod_clock_text");
  if (!clock) return;

  const time = new Date();
  const array = [time.getHours(), time.getMinutes(), time.getSeconds()];
  let ampm = "";

  if (window.settings.clockHours === 12) {
    ampm = array[0] >= 12 ? "PM" : "AM";
    if (array[0] > 12) array[0] = array[0] - 12;
    if (array[0] === 0) array[0] = 12;
  }

  const padded = array.map((entry) => (entry.toString().length !== 2 ? `0${entry}` : entry.toString()));
  let clockString = `${padded[0]}:${padded[1]}:${padded[2]}`
    .match(/.{1}/g)!
    .map((entry) => (entry === ":" ? `<em>${entry}</em>` : `<span>${entry}</span>`))
    .join("");
  if (window.settings.clockHours === 12) clockString += `<span>${ampm}</span>`;
  clock.innerHTML = clockString;
}

async function initKeyboard(layoutName = settingAsString("keyboard", "en-US")) {
  window.keyboard = new Keyboard({
    layout: await readKeyboardLayout(layoutName),
    container: "keyboard",
  });
  window.audioManager?.keyboard?.play();
}

function getDisplayName() {
  const configured = window.settings.username;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  const env = window.edexBoot?.terminalLaunch.env || {};
  return env.USER || env.USERNAME || "";
}

function setModuleAnimations(playState: "paused" | "running") {
  document.querySelectorAll<HTMLElement>(".mod_column > div").forEach((element) => {
    element.style.animationPlayState = playState;
  });
}

function shellIntroStyle(extra = "") {
  return `position:fixed;left:50%;top:34vh;transform:translate(-50%, -50%);${extra}`;
}

async function revealModuleColumns() {
  await Promise.all([initLeftColumnModules(), initRightColumnModules()]);

  setModuleAnimations("paused");
  document.querySelectorAll(".mod_column").forEach((element) => {
    element.classList.add("activated");
  });

  const left = Array.from(document.querySelectorAll<HTMLElement>("#mod_column_left > div"));
  const right = Array.from(document.querySelectorAll<HTMLElement>("#mod_column_right > div"));
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    window.audioManager?.panels?.play();
    if (left[index]) left[index].style.animationPlayState = "running";
    if (right[index]) right[index].style.animationPlayState = "running";
    await window._delay(500);
  }
}

function prepareIntroUi() {
  document.body.classList.remove("booting", "solidBackground");

  const mainShell = document.getElementById("main_shell");
  const shellTitle = document.querySelector<HTMLElement>("#main_shell > h3.title");
  const shellTabs = document.getElementById("main_shell_tabs");
  const shellInner = document.getElementById("main_shell_innercontainer");
  const filesystem = document.getElementById("filesystem");
  const keyboard = document.getElementById("keyboard");

  document.querySelectorAll(".mod_column").forEach((element) => {
    element.classList.remove("activated");
  });
  setModuleAnimations("paused");

  mainShell?.setAttribute("style", shellIntroStyle("height:0%;width:0%;opacity:0;"));
  shellTitle?.setAttribute("style", "opacity:0;");
  if (shellTabs) shellTabs.style.display = "none";
  if (shellInner) shellInner.style.display = "none";
  filesystem?.setAttribute("style", "visibility:hidden;opacity:0;");
  keyboard?.setAttribute("style", "visibility:hidden;opacity:0;");

  document.getElementById("main_shell_greeting")?.remove();
  const greeting = document.createElement("h1");
  greeting.id = "main_shell_greeting";
  mainShell?.append(greeting);
}

async function runIntroUiSequence() {
  prepareIntroUi();

  const mainShell = document.getElementById("main_shell");
  const shellTitle = document.querySelector<HTMLElement>("#main_shell > h3.title");
  const shellTabs = document.getElementById("main_shell_tabs");
  const shellInner = document.getElementById("main_shell_innercontainer");
  const filesystem = document.getElementById("filesystem");
  const keyboard = document.getElementById("keyboard");
  const greeting = document.getElementById("main_shell_greeting");

  await window._delay(10);

  window.audioManager?.expand?.play();
  mainShell?.setAttribute("style", shellIntroStyle("height:0%;"));

  await window._delay(500);

  mainShell?.setAttribute("style", shellIntroStyle());
  shellTitle?.setAttribute("style", "");

  await window._delay(700);

  mainShell?.setAttribute("style", shellIntroStyle("opacity:0;visibility:hidden;"));
  await initKeyboard();

  await window._delay(10);

  mainShell?.setAttribute("style", "visibility:hidden;");

  await window._delay(50);

  mainShell?.setAttribute("style", "");

  await window._delay(270);

  const user = getDisplayName();
  if (greeting) {
    greeting.innerHTML = user ? `Welcome back, <em>${window._escapeHtml(user)}</em>` : "Welcome back";
    greeting.style.opacity = "1";
  }

  filesystem?.setAttribute("style", "");
  keyboard?.setAttribute("style", "");
  keyboard?.setAttribute("class", "animation_state_1");

  await window._delay(100);

  keyboard?.setAttribute("class", "animation_state_1 animation_state_2");

  await window._delay(1000);

  if (greeting) greeting.style.opacity = "0";

  await window._delay(100);

  keyboard?.setAttribute("class", "");

  await window._delay(400);

  greeting?.remove();
  await revealModuleColumns();

  if (shellTabs) shellTabs.style.display = "";
  if (shellInner) shellInner.style.display = "";

  await initTerminalBackend();
  await window._delay(100);
  await initFilesystemDisplay();
  await window._delay(200);
  filesystem?.setAttribute("style", "opacity: 1;");
}

async function initLeftColumnModules() {
  try {
    const [{ Sysinfo }, { HardwareInspector }, { Cpuinfo }, { RAMwatcher }, { Toplist }] = await Promise.all([
      import("./sysinfo"),
      import("./hardwareInspector"),
      import("./cpuinfo"),
      import("./ramwatcher"),
      import("./toplist"),
    ]);

    window.mods.sysinfo = new Sysinfo("mod_column_left");
    window.mods.hardwareInspector = new HardwareInspector("mod_column_left");
    window.mods.cpuinfo = new Cpuinfo("mod_column_left");
    window.mods.ramwatcher = new RAMwatcher("mod_column_left");
    window.mods.toplist = new Toplist("mod_column_left");
  } catch (error) {
    console.error("Failed to initialize left column modules", error);
    void logMessage("error", `Failed to initialize left column modules: ${String(error)}`);
  }
}

async function initRightColumnModules() {
  try {
    const [{ Netstat }, { LocationGlobe }, { Conninfo }] = await Promise.all([
      import("./netstat"),
      import("./locationGlobe"),
      import("./conninfo"),
    ]);
    window.mods.netstat = new Netstat("mod_column_right");
    window.mods.globe = new LocationGlobe("mod_column_right");
    window.mods.conninfo = new Conninfo("mod_column_right");
  } catch (error) {
    console.error("Failed to initialize right column modules", error);
    void logMessage("error", `Failed to initialize right column modules: ${String(error)}`);
  }
}

window.themeChanger = (theme: string) => {
  setThemeOverride(theme)
    .catch((error) => {
      console.error("Failed to set theme override", error);
    })
    .finally(() => {
      window.setTimeout(() => window.location.reload(), 100);
    });
};

window.remakeKeyboard = async (layout: string) => {
  window.settings.keyboard = layout || window.settings.keyboard;
  await initKeyboard(settingAsString("keyboard", "en-US"));
  await setKeyboardOverride(layout);
};

window.openSettings = openSettings;
window.openShortcutsHelp = openShortcutsHelp;
window.writeSettingsFile = writeSettingsFile;

window.focusShellTab = (number: number) => {
  void createTerminal(number).catch((error) => {
    setShellTabText(number, "ERROR");
    console.error(`Failed to focus terminal tab ${number}`, error);
  });
};

function normalizeShortcutKey(key: string) {
  const aliases: Record<string, string> = {
    " ": "SPACE",
    SPACEBAR: "SPACE",
    ESC: "ESCAPE",
    RETURN: "ENTER",
    PLUS: "+",
  };
  const normalized = key.length === 1 ? key.toUpperCase() : key.toUpperCase();
  return aliases[normalized] || normalized;
}

function shortcutMatchesEvent(trigger: string, event: KeyboardEvent) {
  const parts = trigger.split("+").map((part) => part.trim()).filter(Boolean);
  const key = parts.pop();
  if (!key) return false;

  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  if (event.ctrlKey !== (modifiers.has("ctrl") || modifiers.has("control"))) return false;
  if (event.altKey !== modifiers.has("alt")) return false;
  if (event.shiftKey !== modifiers.has("shift")) return false;
  if (event.metaKey !== (modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("command"))) return false;

  return normalizeShortcutKey(event.key) === normalizeShortcutKey(key);
}

function expandShortcut(shortcut: ShortcutConfig) {
  if (shortcut.type === "app" && shortcut.action === "TAB_X") {
    return Array.from({ length: MAX_TERMINALS }, (_value, index) => ({
      ...shortcut,
      trigger: shortcut.trigger.replace("X", String(index + 1)),
      action: `TAB_${index + 1}`,
    }));
  }

  return [shortcut];
}

function handleRegisteredShortcut(event: KeyboardEvent) {
  for (const shortcut of registeredShortcuts) {
    if (!shortcut.enabled || !shortcutMatchesEvent(shortcut.trigger, event)) continue;

    event.preventDefault();
    event.stopPropagation();

    if (shortcut.type === "app") return window.useAppShortcut(shortcut.action);
    if (shortcut.type === "shell") {
      const terminal = activeTerminal();
      if (shortcut.linebreak) terminal?.writelr(shortcut.action);
      else terminal?.write(shortcut.action);
      return true;
    }

    console.warn(`${shortcut.trigger} has unknown type`);
    return false;
  }

  return false;
}

window.useAppShortcut = (action: string) => {
  switch (action) {
    case "COPY":
      activeTerminal()?.clipboard.copy();
      return true;
    case "PASTE":
      activeTerminal()?.clipboard.paste();
      return true;
    case "NEXT_TAB":
      for (let offset = 1; offset <= MAX_TERMINALS; offset += 1) {
        const next = ((window.currentTerm || 0) + offset) % MAX_TERMINALS;
        if (window.term?.[next] || next === 0) {
          window.focusShellTab(next);
          return true;
        }
      }
      return true;
    case "PREVIOUS_TAB":
      for (let offset = 1; offset <= MAX_TERMINALS; offset += 1) {
        const previous = ((window.currentTerm || 0) - offset + MAX_TERMINALS) % MAX_TERMINALS;
        if (window.term?.[previous] || previous === 0) {
          window.focusShellTab(previous);
          return true;
        }
      }
      return true;
    case "DEV_DEBUG":
      openDevtools().catch((error) => console.warn(error));
      return true;
    case "DEV_RELOAD":
      window.location.reload();
      return true;
    case "TAB_1":
      window.focusShellTab(0);
      return true;
    case "TAB_2":
      window.focusShellTab(1);
      return true;
    case "TAB_3":
      window.focusShellTab(2);
      return true;
    case "TAB_4":
      window.focusShellTab(3);
      return true;
    case "TAB_5":
      window.focusShellTab(4);
      return true;
    case "SETTINGS":
      void window.openSettings();
      return true;
    case "SHORTCUTS":
      window.openShortcutsHelp();
      return true;
    case "FUZZY_SEARCH":
      window.activeFuzzyFinder = new FuzzyFinder();
      return true;
    case "FS_LIST_VIEW":
      window.fsDisp?.toggleListview();
      return true;
    case "FS_DOTFILES":
      window.fsDisp?.toggleHidedotfiles();
      return true;
    case "KB_PASSMODE":
      window.keyboard?.togglePasswordMode();
      return true;
    default:
      console.warn(`Shortcut action "${action}" is not ported yet`);
      return false;
  }
};

window.registerKeyboardShortcuts = () => {
  registeredShortcuts = window.shortcuts.flatMap((shortcut) => expandShortcut(shortcut)).filter((shortcut) => shortcut.enabled);
};

document.addEventListener(
  "keydown",
  (event) => {
    handleRegisteredShortcut(event);
  },
  { capture: true },
);

document.addEventListener("keydown", (event) => {
  if (event.key === "Alt") event.preventDefault();
  if (event.code.startsWith("Alt") && event.ctrlKey && event.shiftKey) event.preventDefault();
  if (event.key === "F11" && !window.settings.allowWindowed) event.preventDefault();
  if (event.code === "KeyD" && event.ctrlKey) event.preventDefault();
  if (event.code === "KeyA" && event.ctrlKey) event.preventDefault();
});

window.addEventListener("resize", () => {
  if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = null;
    activeTerminal()?.scheduleFit();
  });
});

window.addEventListener("DOMContentLoaded", () => {
  initGraphicalErrorHandling();

  for (let index = 0; index < MAX_TERMINALS; index += 1) {
    document.getElementById(`shell_tab${index}`)?.addEventListener("click", () => window.focusShellTab(index));
  }

  loadBootstrapConfig()
    .then(async () => {
      window.registerKeyboardShortcuts();
      if (window.settings.nointro || window.settings.nointroOverride) {
        document.getElementById("boot_screen")?.remove();
        document.body.classList.remove("booting", "solidBackground");
        await waitForFonts();

        const keyboardReady = initKeyboard().catch((error) => {
          logStartupError("Keyboard failed to initialize", error);
        });
        const terminalReady = initTerminalBackend()
          .then(initFilesystemDisplay)
          .catch((error) => {
            logStartupError("Terminal failed to initialize", error);
          });

        Promise.allSettled([keyboardReady, terminalReady]).then(() => {
          window.setTimeout(() => {
            void initLeftColumnModules();
            void initRightColumnModules();
          }, 250);
        });
      } else {
        await displayStartupIntro();
        await waitForFonts();
        await runIntroUiSequence();
      }
    })
    .catch((error) => {
      document.body.classList.remove("booting", "solidBackground");
      logStartupError("Failed to load eDEX config", error);
    });
  updateClock();
  window.setInterval(updateClock, 1000);
});

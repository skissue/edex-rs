import { listen } from "@tauri-apps/api/event";
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
  spawnTerminal,
  resizeTerminal,
  writeTerminal,
  killTerminal,
  type BootstrapConfig,
  type JsonObject,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type ThemeConfig,
} from "./backend";
import { Keyboard } from "./keyboard";

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
    useAppShortcut: (action: string) => boolean;
    focusShellTab: (number: number) => void;
    registerKeyboardShortcuts: () => void;
    si: Record<string, (...args: unknown[]) => Promise<unknown>>;
  }
}

window.settings = {};
window.shortcuts = [];
window.lastWindowState = {};
window.currentTerm = 0;

let mainTerminalId: number | null = null;

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
    logMessage("error", detail).catch((logError) => {
      console.error("Failed to write renderer error to backend log", logError);
    });
  };
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
  return new Promise<void>((resolve) => {
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
  initGraphicalErrorHandling();
  initSystemInformationProxy();
  await waitForFonts();

  console.info("Loaded eDEX config", {
    settingsDir: boot.paths.settingsDir,
    version: boot.metadata.version,
    shell: boot.terminalLaunch.shell,
    theme: window.settings.theme,
    keyboard: window.settings.keyboard,
  });
}

function terminalElement() {
  return document.getElementById(`terminal${window.currentTerm}`) || document.getElementById("terminal0");
}

window.term = {
  0: {
    write: (data: string) => {
      if (mainTerminalId === null) {
        appendTerminalOutput(data);
        return;
      }
      writeTerminal(mainTerminalId, data).catch((error) => {
        console.error("Failed to write to terminal", error);
      });
    },
    writelr: (data: string) => {
      window.term?.[0]?.write?.(`${data}\r`);
    },
    fit: () => {
      if (mainTerminalId !== null) {
        resizeTerminal(mainTerminalId, 80, 24).catch((error) => {
          console.error("Failed to resize terminal", error);
        });
      }
    },
    term: {
      focus: () => terminalElement()?.focus(),
    },
  },
};

function stripTerminalControls(data: string) {
  return data
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[=>]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function appendTerminalOutput(data: string) {
  const terminal = terminalElement();
  if (!terminal) return;
  terminal.textContent = `${terminal.textContent || ""}${stripTerminalControls(data)}`;
  terminal.scrollTop = terminal.scrollHeight;
}

function terminalInputFromKey(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  switch (event.key) {
    case "Enter":
      return "\r";
    case "Backspace":
      return "\x7f";
    case "Delete":
      return "\x1b[3~";
    case "Tab":
      return "\t";
    case "ArrowUp":
      return "\x1b[A";
    case "ArrowDown":
      return "\x1b[B";
    case "ArrowRight":
      return "\x1b[C";
    case "ArrowLeft":
      return "\x1b[D";
    default:
      return event.key.length === 1 ? event.key : null;
  }
}

function isTextInputTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

async function initTerminalBackend() {
  const terminal = document.getElementById("terminal0");
  if (terminal) {
    terminal.tabIndex = 0;
    terminal.textContent = "";
  }

  await listen<TerminalDataEvent>("terminal:data", (event) => {
    if (mainTerminalId === null || event.payload.id === mainTerminalId) appendTerminalOutput(event.payload.data);
  });
  await listen<TerminalExitEvent>("terminal:exit", (event) => {
    if (event.payload.id !== mainTerminalId) return;
    appendTerminalOutput(
      `\n[process exited with code ${event.payload.code}${event.payload.signal ? `, signal ${event.payload.signal}` : ""}]\n`,
    );
    mainTerminalId = null;
  });

  const session = await spawnTerminal(window.settings, 80, 24);
  mainTerminalId = session.id;
  document.getElementById("shell_tab0")?.replaceChildren(document.createElement("p"));
  document.querySelector("#shell_tab0 > p")!.textContent = `MAIN - ${session.pid ?? "PTY"}`;

  window.addEventListener("beforeunload", () => {
    if (mainTerminalId !== null) void killTerminal(mainTerminalId);
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

async function initKeyboard(layoutName = settingAsString("keyboard", "en-US")) {
  window.keyboard = new Keyboard({
    layout: await readKeyboardLayout(layoutName),
    container: "keyboard",
  });
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

window.focusShellTab = (number: number) => {
  document.querySelectorAll("ul#main_shell_tabs > li").forEach((tab) => tab.classList.remove("active"));
  document.getElementById(`shell_tab${number}`)?.classList.add("active");

  document.querySelectorAll("div#main_shell_innercontainer > pre").forEach((terminal) => terminal.classList.remove("active"));
  document.getElementById(`terminal${number}`)?.classList.add("active");
};

window.useAppShortcut = (action: string) => {
  switch (action) {
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
    default:
      console.warn(`Shortcut action "${action}" is not ported yet`);
      return false;
  }
};

window.registerKeyboardShortcuts = () => undefined;

document.addEventListener("keydown", (event) => {
  if (event.key === "Alt") event.preventDefault();
  if (event.code.startsWith("Alt") && event.ctrlKey && event.shiftKey) event.preventDefault();
  if (event.key === "F11" && !window.settings.allowWindowed) event.preventDefault();
  if (event.code === "KeyD" && event.ctrlKey) event.preventDefault();
  if (event.code === "KeyA" && event.ctrlKey) event.preventDefault();

  if (isTextInputTarget(event.target)) return;
  const terminalInput = terminalInputFromKey(event);
  if (terminalInput === null) return;
  window.term?.[window.currentTerm || 0]?.write?.(terminalInput);
  event.preventDefault();
});

window.addEventListener("DOMContentLoaded", () => {
  loadBootstrapConfig()
    .then(async () => {
      await initTerminalBackend();
      await initKeyboard();
    })
    .catch((error) => {
      console.error("Failed to load eDEX config", error);
    });
  updateClock();
  window.setInterval(updateClock, 1000);
});

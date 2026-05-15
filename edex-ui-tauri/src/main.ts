import enUsLayout from "./assets/kb_layouts/en-US.json";
import {
  getBootstrapConfig,
  getKeyboardOverride,
  getThemeOverride,
  logMessage,
  openDevtools,
  readTheme,
  setKeyboardOverride,
  setThemeOverride,
  type BootstrapConfig,
  type JsonObject,
  type KeySpec,
  type ThemeConfig,
} from "./backend";

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
    remakeKeyboard: (layout: string) => void;
    useAppShortcut: (action: string) => boolean;
    focusShellTab: (number: number) => void;
    registerKeyboardShortcuts: () => void;
    si: Record<string, (...args: unknown[]) => Promise<unknown>>;
  }
}

window.settings = {};
window.shortcuts = [];
window.lastWindowState = {};

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

window.themeChanger = (theme: string) => {
  setThemeOverride(theme)
    .catch((error) => {
      console.error("Failed to set theme override", error);
    })
    .finally(() => {
      window.setTimeout(() => window.location.reload(), 100);
    });
};

window.remakeKeyboard = (layout: string) => {
  window.settings.keyboard = layout || window.settings.keyboard;
  setKeyboardOverride(layout).catch((error) => {
    console.error("Failed to set keyboard override", error);
  });
  const keyboard = document.getElementById("keyboard");
  if (keyboard) {
    keyboard.innerHTML = "";
    renderKeyboard();
  }
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
});

window.addEventListener("DOMContentLoaded", () => {
  loadBootstrapConfig().catch((error) => {
    console.error("Failed to load eDEX config", error);
  });
  renderKeyboard();
  updateClock();
  window.setInterval(updateClock, 1000);
});

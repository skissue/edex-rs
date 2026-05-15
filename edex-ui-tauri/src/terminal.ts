import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type FontWeight } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  killTerminal,
  resizeTerminal,
  spawnTerminal,
  writeTerminal,
  type JsonObject,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type TerminalSessionInfo,
  type ThemeConfig,
} from "./backend";

type TerminalTheme = NonNullable<ConstructorParameters<typeof Terminal>[0]>["theme"];

function boolOption(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function numberOption(value: unknown, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function stringOption(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function xtermTheme(theme: ThemeConfig): TerminalTheme {
  const terminal = theme.terminal;
  const colors = theme.colors;
  const fallbackRgb = `rgb(${theme.colors.r}, ${theme.colors.g}, ${theme.colors.b})`;

  return {
    foreground: stringOption(terminal.foreground, fallbackRgb),
    background: stringOption(terminal.background, colors.light_black),
    cursor: stringOption(terminal.cursor, fallbackRgb),
    cursorAccent: stringOption(terminal.cursorAccent, fallbackRgb),
    selectionBackground: stringOption(terminal.selection, `rgba(${colors.r},${colors.g},${colors.b},0.3)`),
    black: stringOption(colors.black, "#000000"),
    red: stringOption(colors.red, "#cc0000"),
    green: stringOption(colors.green, "#4e9a06"),
    yellow: stringOption(colors.yellow, "#c4a000"),
    blue: stringOption(colors.blue, "#3465a4"),
    magenta: stringOption(colors.magenta, "#75507b"),
    cyan: stringOption(colors.cyan, "#06989a"),
    white: stringOption(colors.white, "#d3d7cf"),
    brightBlack: stringOption(colors.brightBlack, "#555753"),
    brightRed: stringOption(colors.brightRed, "#ef2929"),
    brightGreen: stringOption(colors.brightGreen, "#8ae234"),
    brightYellow: stringOption(colors.brightYellow, "#fce94f"),
    brightBlue: stringOption(colors.brightBlue, "#729fcf"),
    brightMagenta: stringOption(colors.brightMagenta, "#ad7fa8"),
    brightCyan: stringOption(colors.brightCyan, "#34e2e2"),
    brightWhite: stringOption(colors.brightWhite, "#eeeeec"),
  };
}

export class TauriTerminal {
  readonly term: Terminal;

  private readonly fitAddon = new FitAddon();
  private readonly parent: HTMLElement;
  private readonly settings: JsonObject;
  private readonly unlisteners: UnlistenFn[] = [];
  private id: number | null = null;
  private starting = false;

  cwd = "";
  oncwdchange: (cwd: string | null) => void = () => undefined;
  onprocesschange?: (processName: string) => void;
  onclose?: (event: TerminalExitEvent) => void;

  clipboard = {
    copy: () => {
      if (!this.term.hasSelection()) return false;
      void navigator.clipboard.writeText(this.term.getSelection());
      this.term.clearSelection();
      this.clipboard.didCopy = true;
      return true;
    },
    paste: () => {
      void navigator.clipboard.readText().then((text) => {
        this.write(text);
        this.clipboard.didCopy = false;
      });
    },
    didCopy: false,
  };

  constructor(opts: { parentId: string; settings: JsonObject; theme: ThemeConfig }) {
    const parent = document.getElementById(opts.parentId);
    if (!parent) throw new Error(`missing terminal parent: ${opts.parentId}`);

    this.parent = parent;
    this.settings = opts.settings;
    this.parent.textContent = "";
    this.parent.tabIndex = 0;

    this.term = new Terminal({
      cols: 80,
      rows: 24,
      cursorBlink: boolOption(opts.theme.terminal.cursorBlink, true),
      cursorStyle: stringOption(opts.theme.terminal.cursorStyle, "block") as "block" | "underline" | "bar",
      allowTransparency: boolOption(opts.theme.terminal.allowTransparency, false),
      fontFamily: stringOption(opts.theme.terminal.fontFamily, "Fira Mono"),
      fontSize: numberOption(opts.theme.terminal.fontSize, numberOption(opts.settings.termFontSize, 15)),
      fontWeight: stringOption(opts.theme.terminal.fontWeight, "normal") as FontWeight,
      fontWeightBold: stringOption(opts.theme.terminal.fontWeightBold, "bold") as FontWeight,
      letterSpacing: numberOption(opts.theme.terminal.letterSpacing, 0),
      lineHeight: numberOption(opts.theme.terminal.lineHeight, 1),
      scrollback: 1500,
      theme: xtermTheme(opts.theme),
    });

    this.term.loadAddon(this.fitAddon);
    this.term.open(this.parent);
    this.term.onData((data) => this.write(data));
    this.parent.querySelectorAll(".xterm-helper-textarea").forEach((textarea) => {
      textarea.setAttribute("readonly", "readonly");
    });
  }

  async start() {
    this.starting = true;
    this.fit();
    this.unlisteners.push(
      await listen<TerminalDataEvent>("terminal:data", (event) => {
        if (this.id === null && !this.starting) return;
        if (this.id !== null && event.payload.id !== this.id) return;
        this.term.write(event.payload.data);
      }),
    );
    this.unlisteners.push(
      await listen<TerminalExitEvent>("terminal:exit", (event) => {
        if (event.payload.id !== this.id) return;
        this.term.writeln("");
        this.term.writeln(
          `[process exited with code ${event.payload.code}${event.payload.signal ? `, signal ${event.payload.signal}` : ""}]`,
        );
        this.id = null;
        this.onclose?.(event.payload);
      }),
    );

    const session = await spawnTerminal(this.settings, this.term.cols, this.term.rows);
    this.id = session.id;
    this.cwd = session.cwd;
    this.oncwdchange(this.cwd);
    this.onprocesschange?.(session.pid === null ? "PTY" : String(session.pid));
    this.starting = false;
    this.term.focus();
    return session;
  }

  fit() {
    try {
      this.fitAddon.fit();
    } catch (error) {
      console.warn("Failed to fit terminal", error);
    }
    if (this.id !== null) {
      resizeTerminal(this.id, this.term.cols, this.term.rows).catch((error) => {
        console.error("Failed to resize terminal", error);
      });
    }
  }

  write(data: string) {
    if (this.id === null) return;
    writeTerminal(this.id, data).catch((error) => {
      console.error("Failed to write to terminal", error);
    });
  }

  writelr(data: string) {
    this.write(`${data}\r`);
  }

  resendCWD() {
    this.oncwdchange(this.cwd || null);
  }

  async dispose() {
    for (const unlisten of this.unlisteners.splice(0)) unlisten();
    if (this.id !== null) {
      await killTerminal(this.id).catch((error) => {
        console.error("Failed to kill terminal", error);
      });
      this.id = null;
    }
    this.term.dispose();
  }

  sessionId() {
    return this.id;
  }
}

export type StartedTerminal = TauriTerminal & {
  start: () => Promise<TerminalSessionInfo>;
};

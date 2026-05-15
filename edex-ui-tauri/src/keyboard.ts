import type { KeyboardLayout, KeySpec, ShortcutConfig } from "./backend";

type ShortcutCategory = "CtrlAltShift" | "CtrlAlt" | "CtrlShift" | "AltShift" | "Ctrl" | "Alt" | "Shift";

type KeyboardKeyElement = HTMLDivElement & {
  holdTimeout?: number;
  holdInterval?: number;
};

type TerminalLike = {
  write?: (data: string) => void;
  writelr?: (data: string) => void;
  fit?: () => void;
  term?: { focus?: () => void };
};

type EditableElement = HTMLElement & {
  value?: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
};

declare global {
  interface Window {
    keyboard?: Keyboard;
    shortcuts: ShortcutConfig[];
    currentTerm?: number;
    term?: Record<number, TerminalLike | undefined>;
    audioManager?: Record<string, { play: () => void } | undefined>;
    passwordMode?: string;
    useAppShortcut: (action: string) => boolean;
  }
}

const ICON_PREFIX = "ESCAPED|-- ICON: ";

const ICONS: Record<string, string> = {
  ARROW_UP: `<svg viewBox="0 0 24.00 24.00"><path fill-opacity="1" d="m12.00004 7.99999 4.99996 5h-2.99996v4.00001h-4v-4.00001h-3z"/><path stroke-linejoin="round" fill-opacity="0.65" d="m4 3h16c1.1046 0 1-0.10457 1 1v16c0 1.1046 0.1046 1-1 1h-16c-1.10457 0-1 0.1046-1-1v-16c0-1.10457-0.10457-1 1-1zm0 1v16h16v-16z"/></svg>`,
  ARROW_LEFT: `<svg viewBox="0 0 24.00 24.00"><path fill-opacity="1" d="m7.500015 12.499975 5-4.99996v2.99996h4.00001v4h-4.00001v3z"/><path stroke-linejoin="round" fill-opacity="0.65" d="m4 3h16c1.1046 0 1-0.10457 1 1v16c0 1.1046 0.1046 1-1 1h-16c-1.10457 0-1 0.1046-1-1v-16c0-1.10457-0.10457-1 1-1zm0 1v16h16v-16z"/></svg>`,
  ARROW_DOWN: `<svg viewBox="0 0 24.00 24.00"><path fill-opacity="1" d="m12 17-4.99996-5h2.99996v-4.00001h4v4.00001h3z"/><path stroke-linejoin="round" fill-opacity="0.65" d="m4 3h16c1.1046 0 1-0.10457 1 1v16c0 1.1046 0.1046 1-1 1h-16c-1.10457 0-1 0.1046-1-1v-16c0-1.10457-0.10457-1 1-1zm0 1v16h16v-16z"/></svg>`,
  ARROW_RIGHT: `<svg viewBox="0 0 24.00 24.00"><path fill-opacity="1" d="m16.500025 12.500015-5 4.99996v-2.99996h-4.00001v-4h4.00001v-3z"/><path stroke-linejoin="round" fill-opacity="0.65" d="m4 3h16c1.1046 0 1-0.10457 1 1v16c0 1.1046 0.1046 1-1 1h-16c-1.10457 0-1 0.1046-1-1v-16c0-1.10457-0.10457-1 1-1zm0 1v16h16v-16z"/></svg>`,
};

const MISSING_ICON = `<svg viewBox="0 0 24.00 24.00"><path fill="#ff0000" fill-opacity="1" d="M 8.27125,2.9978L 2.9975,8.27125L 2.9975,15.7275L 8.27125,21.0012L 15.7275,21.0012C 17.485,19.2437 21.0013,15.7275 21.0013,15.7275L 21.0013,8.27125L 15.7275,2.9978M 9.10125,5L 14.9025,5L 18.9988,9.10125L 18.9988,14.9025L 14.9025,18.9988L 9.10125,18.9988L 5,14.9025L 5,9.10125M 9.11625,7.705L 7.705,9.11625L 10.5912,12.0025L 7.705,14.8825L 9.11625,16.2937L 12.0025,13.4088L 14.8825,16.2937L 16.2938,14.8825L 13.4087,12.0025L 16.2938,9.11625L 14.8825,7.705L 12.0025,10.5913"/></svg>`;

function mapChar(map: Record<string, string>, char: string) {
  return map[char] || char;
}

export class Keyboard {
  private readonly ctrlseq = [
    "",
    "\x1B",
    "\x1C",
    "\x1D",
    "\x1E",
    "\x1F",
    "\x11",
    "\x17",
    "\x12",
    "\x12",
    "\x19",
    "\x15",
    "\x10",
    "\x01",
    "\x13",
    "\x04",
    "\x06",
    "\x1A",
    "\x18",
    "\x03",
    "\x16",
    "\x02",
  ];

  private readonly container: HTMLElement;
  private readonly shortcuts: Record<ShortcutCategory, ShortcutConfig[]> = {
    CtrlAltShift: [],
    CtrlAlt: [],
    CtrlShift: [],
    AltShift: [],
    Ctrl: [],
    Alt: [],
    Shift: [],
  };

  linkedToTerm = true;
  keydownHandler: (event: KeyboardEvent) => void;

  constructor(opts: { layout: KeyboardLayout; container: string }) {
    const container = document.getElementById(opts.container);
    if (!opts.layout || !container) throw new Error("Missing options");

    this.container = container;
    this.container.innerHTML = "";
    this.setDefaultDatasets();
    this.buildShortcuts();
    this.buildLayout(opts.layout);
    this.bindPointerEvents();
    this.bindTouchEvents();
    this.keydownHandler = (event) => this.onKeydown(event);
    document.onkeydown = this.keydownHandler;
    document.onkeyup = (event) => this.onKeyup(event);
    window.addEventListener("blur", () => this.releaseActiveKeys());
  }

  detach() {
    this.linkedToTerm = false;
  }

  attach() {
    this.linkedToTerm = true;
  }

  pressKey(key: KeyboardKeyElement) {
    let cmd = key.dataset.cmd || "";
    const shortcutsCat = this.currentShortcutCategory();
    let shortcutsTriggered = false;

    if (shortcutsCat.length > 1 && this.isShortcutCategory(shortcutsCat)) {
      this.shortcuts[shortcutsCat].forEach((cut) => {
        if (!cut.enabled) return;

        const trig = cut.trigger
          .toLowerCase()
          .replace("plus", "+")
          .replace("space", " ")
          .replace("tab", "\t")
          .replace(/backspace|delete/, "\b")
          .replace(/esc|escape/, this.ctrlseq[1])
          .replace(/return|enter/, "\r");

        if (cmd !== trig) return;

        if (cut.type === "app") {
          window.useAppShortcut(cut.action);
          shortcutsTriggered = true;
        } else if (cut.type === "shell") {
          this.writeToTerm(cut.action, Boolean(cut.linebreak));
        } else {
          console.warn(`${cut.trigger} has unknown type`);
        }
      });
    }

    if (shortcutsTriggered) return;

    if ((this.container.dataset.isShiftOn === "true" && key.dataset.shift_cmd) || (this.container.dataset.isCapsLckOn === "true" && key.dataset.shift_cmd)) cmd = key.dataset.shift_cmd;
    if (this.container.dataset.isCapsLckOn === "true" && key.dataset.capslck_cmd) cmd = key.dataset.capslck_cmd;
    if (this.container.dataset.isCtrlOn === "true" && key.dataset.ctrl_cmd) cmd = key.dataset.ctrl_cmd;
    if (this.container.dataset.isAltOn === "true" && key.dataset.alt_cmd) cmd = key.dataset.alt_cmd;
    if (this.container.dataset.isAltOn === "true" && this.container.dataset.isShiftOn === "true" && key.dataset.altshift_cmd) cmd = key.dataset.altshift_cmd;
    if (this.container.dataset.isFnOn === "true" && key.dataset.fn_cmd) cmd = key.dataset.fn_cmd;

    cmd = this.applyPendingAccent(cmd);
    if (this.handleEscapedCommand(cmd)) return;

    if (cmd === "\n") {
      if (this.linkedToTerm) {
        this.writeToTerm("", true);
      } else {
        document.activeElement?.dispatchEvent(new CustomEvent("change", { detail: "enter" }));
      }
      return;
    }

    if (this.linkedToTerm) {
      this.writeToTerm(cmd, false);
    } else {
      this.writeToActiveElement(cmd);
    }
  }

  togglePasswordMode() {
    const mode = this.container.dataset.passwordMode === "true" ? "false" : "true";
    this.container.dataset.passwordMode = mode;
    window.passwordMode = mode;
    return mode;
  }

  private setDefaultDatasets() {
    this.container.dataset.isShiftOn = "false";
    this.container.dataset.isCapsLckOn = "false";
    this.container.dataset.isAltOn = "false";
    this.container.dataset.isCtrlOn = "false";
    this.container.dataset.isFnOn = "false";
    this.container.dataset.passwordMode = "false";
  }

  private buildShortcuts() {
    window.shortcuts.forEach((shortcut) => {
      const cut = { ...shortcut };
      const mods = cut.trigger.split("+");
      cut.trigger = mods.pop() || "";
      const order = ["Ctrl", "Alt", "Shift"];
      mods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const cat = mods.join("");
      if (!this.isShortcutCategory(cat)) return;

      if (cut.type === "app" && cut.action === "TAB_X" && cut.trigger === "X") {
        for (let i = 1; i <= 5; i += 1) {
          this.shortcuts[cat].push({ ...cut, trigger: `${i}`, action: `TAB_${i}` });
        }
      } else {
        this.shortcuts[cat].push(cut);
      }
    });
  }

  private buildLayout(layout: KeyboardLayout) {
    Object.keys(layout).forEach((rowName) => {
      const row = document.createElement("div");
      row.className = "keyboard_row";
      row.id = rowName;
      this.container.appendChild(row);

      layout[rowName].forEach((keySpec) => {
        const keyObj = { ...keySpec };
        const key = document.createElement("div") as KeyboardKeyElement;
        key.className = keyObj.cmd === "\r" ? "keyboard_key keyboard_enter" : "keyboard_key";
        if (keyObj.cmd === " ") key.id = "keyboard_spacebar";
        key.innerHTML = this.keyMarkup(keyObj);

        Object.keys(keyObj).forEach((property) => {
          let value = keyObj[property];
          if (typeof value !== "string") return;
          for (let i = 1; i < this.ctrlseq.length; i += 1) {
            value = value.replace(`~~~CTRLSEQ${i}~~~`, this.ctrlseq[i]);
          }
          keyObj[property] = value;
          if (property.endsWith("cmd")) key.dataset[property] = value;
        });

        row.appendChild(key);
      });
    });
  }

  private keyMarkup(keyObj: KeySpec) {
    if (keyObj.cmd === "\r") return `<h1>${keyObj.name || ""}</h1>`;
    if (keyObj.name?.startsWith(ICON_PREFIX)) {
      const icon = keyObj.name.slice(ICON_PREFIX.length);
      return ICONS[icon] || MISSING_ICON;
    }
    return `
                        <h5>${keyObj.altshift_name || ""}</h5>
                        <h4>${keyObj.fn_name || ""}</h4>
                        <h3>${keyObj.alt_name || ""}</h3>
                        <h2>${keyObj.shift_name || ""}</h2>
                        <h1>${keyObj.name || ""}</h1>`;
  }

  private bindPointerEvents() {
    this.allKeys().forEach((key) => {
      if (key.className.endsWith("keyboard_enter")) {
        key.onmousedown = (event) => {
          this.pressAndHold(key);
          this.enterKeys().forEach((enterKey) => {
            enterKey.className = "keyboard_key active keyboard_enter";
          });
          this.focusTerm();
          this.playAudio("granted");
          event.preventDefault();
        };
        key.onmouseup = () => {
          this.clearHold(key);
          this.blinkEnterKeys();
        };
      } else {
        key.onmousedown = (event) => {
          if (/^ESCAPED\|-- (CTRL|SHIFT|ALT){1}.*/.test(key.dataset.cmd || "")) {
            const cmd = (key.dataset.cmd || "").substring(11);
            if (cmd.startsWith("CTRL")) this.container.dataset.isCtrlOn = "true";
            if (cmd.startsWith("SHIFT")) this.container.dataset.isShiftOn = "true";
            if (cmd.startsWith("ALT")) this.container.dataset.isAltOn = "true";
          } else {
            this.pressAndHold(key);
          }

          this.focusTerm();
          this.playAudio("stdin");
          event.preventDefault();
        };
        key.onmouseup = () => {
          if (/^ESCAPED\|-- (CTRL|SHIFT|ALT){1}.*/.test(key.dataset.cmd || "")) {
            const cmd = (key.dataset.cmd || "").substring(11);
            if (cmd.startsWith("CTRL")) this.container.dataset.isCtrlOn = "false";
            if (cmd.startsWith("SHIFT")) this.container.dataset.isShiftOn = "false";
            if (cmd.startsWith("ALT")) this.container.dataset.isAltOn = "false";
          } else {
            this.clearHold(key);
          }

          key.className = "keyboard_key blink";
          window.setTimeout(() => {
            key.className = "keyboard_key";
          }, 100);
        };
      }

      key.onmouseleave = () => this.clearHold(key);
    });
  }

  private bindTouchEvents() {
    this.container.addEventListener("touchstart", (event) => {
      event.preventDefault();
      Array.from(event.changedTouches).forEach((touch) => {
        const key = this.closestKey(touch.target);
        if (!key) return;
        key.className = `${key.className} active`;
        key.onmousedown?.(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      });
    });

    const dropKeyTouchHandler = (event: TouchEvent) => {
      event.preventDefault();
      Array.from(event.changedTouches).forEach((touch) => {
        const key = this.closestKey(touch.target);
        if (!key) return;
        key.className = key.className.replace("active", "");
        key.onmouseup?.(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      });
    };
    this.container.addEventListener("touchend", dropKeyTouchHandler);
    this.container.addEventListener("touchcancel", dropKeyTouchHandler);
  }

  private onKeydown(event: KeyboardEvent) {
    if (event.getModifierState("AltGraph") && event.code === "AltRight") {
      this.findKeyByDataset("cmd", "ESCAPED|-- CTRL: LEFT")?.classList.remove("active");
    }

    if (event.code === "ControlLeft" || event.code === "ControlRight") this.container.dataset.isCtrlOn = "true";
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") this.container.dataset.isShiftOn = "true";
    if (event.code === "AltLeft" || event.code === "AltRight") this.container.dataset.isAltOn = "true";
    if (event.code === "CapsLock" && this.container.dataset.isCapsLckOn !== "true") this.container.dataset.isCapsLckOn = "true";
    if (event.code === "CapsLock" && this.container.dataset.isCapsLckOn === "true") this.container.dataset.isCapsLckOn = "false";

    const key = this.findKey(event);
    if (key === null) return;
    if (Array.isArray(key)) {
      key.forEach((enterElement) => {
        enterElement.className = "keyboard_key active keyboard_enter";
      });
    } else {
      key.className = "keyboard_key active";
    }

    if (!event.repeat || (event.repeat && !event.code.startsWith("Shift") && !event.code.startsWith("Alt") && !event.code.startsWith("Control") && !event.code.startsWith("Caps"))) {
      this.playAudio("stdin");
    }
  }

  private onKeyup(event: KeyboardEvent) {
    if (event.key === "Control" && event.getModifierState("AltGraph")) return;

    if (event.code === "ControlLeft" || event.code === "ControlRight") this.container.dataset.isCtrlOn = "false";
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") this.container.dataset.isShiftOn = "false";
    if (event.code === "AltLeft" || event.code === "AltRight") this.container.dataset.isAltOn = "false";

    const key = this.findKey(event);
    if (key === null) return;
    if (Array.isArray(key)) {
      key.forEach((enterElement) => {
        enterElement.className = "keyboard_key blink keyboard_enter";
      });
      window.setTimeout(() => {
        key.forEach((enterElement) => {
          enterElement.className = "keyboard_key keyboard_enter";
        });
      }, 100);
    } else {
      key.className = "keyboard_key blink";
      window.setTimeout(() => {
        key.className = "keyboard_key";
      }, 100);
    }

    if (this.container.dataset.passwordMode === "false" && event.key === "Enter") this.playAudio("granted");
  }

  private findKey(event: KeyboardEvent): KeyboardKeyElement | KeyboardKeyElement[] | null {
    let key = this.findKeyByDataset("cmd", event.key === '"' ? '\\"' : event.key);
    if (key === null) key = this.findKeyByDataset("shift_cmd", event.key === '"' ? '\\"' : event.key);

    if (key === null && event.code === "ShiftLeft") key = this.findKeyByDataset("cmd", "ESCAPED|-- SHIFT: LEFT");
    if (key === null && event.code === "ShiftRight") key = this.findKeyByDataset("cmd", "ESCAPED|-- SHIFT: RIGHT");
    if (key === null && event.code === "ControlLeft") key = this.findKeyByDataset("cmd", "ESCAPED|-- CTRL: LEFT");
    if (key === null && event.code === "ControlRight") key = this.findKeyByDataset("cmd", "ESCAPED|-- CTRL: RIGHT");
    if (key === null && event.code === "AltLeft") key = this.findKeyByDataset("cmd", "ESCAPED|-- FN: ON");
    if (key === null && event.code === "AltRight") key = this.findKeyByDataset("cmd", "ESCAPED|-- ALT: RIGHT");
    if (key === null && event.code === "CapsLock") key = this.findKeyByDataset("cmd", "ESCAPED|-- CAPSLCK: ON");
    if (key === null && event.code === "Escape") key = this.findKeyByDataset("cmd", "\x1B");
    if (key === null && event.code === "Backspace") key = this.findKeyByDataset("cmd", "\b");
    if (key === null && event.code === "ArrowUp") key = this.findKeyByDataset("cmd", "\x1BOA");
    if (key === null && event.code === "ArrowLeft") key = this.findKeyByDataset("cmd", "\x1BOD");
    if (key === null && event.code === "ArrowDown") key = this.findKeyByDataset("cmd", "\x1BOB");
    if (key === null && event.code === "ArrowRight") key = this.findKeyByDataset("cmd", "\x1BOC");
    if (key === null && event.code === "Enter") return this.enterKeys();
    if (key === null) key = this.findKeyByDataset("ctrl_cmd", event.key);
    if (key === null) key = this.findKeyByDataset("alt_cmd", event.key);
    return key;
  }

  private pressAndHold(key: KeyboardKeyElement) {
    key.holdTimeout = window.setTimeout(() => {
      key.holdInterval = window.setInterval(() => {
        this.pressKey(key);
      }, 70);
    }, 400);
    this.pressKey(key);
  }

  private clearHold(key: KeyboardKeyElement) {
    window.clearTimeout(key.holdTimeout);
    window.clearInterval(key.holdInterval);
  }

  private blinkEnterKeys() {
    this.enterKeys().forEach((key) => {
      key.className = "keyboard_key blink keyboard_enter";
    });
    window.setTimeout(() => {
      this.enterKeys().forEach((key) => {
        key.className = "keyboard_key keyboard_enter";
      });
    }, 100);
  }

  private releaseActiveKeys() {
    this.allKeys(".active").forEach((key) => {
      key.className = key.className.replace("active", "");
      key.onmouseup?.(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    });
  }

  private currentShortcutCategory() {
    let shortcutsCat = "";
    if (this.container.dataset.isCtrlOn === "true") shortcutsCat += "Ctrl";
    if (this.container.dataset.isAltOn === "true") shortcutsCat += "Alt";
    if (this.container.dataset.isShiftOn === "true") shortcutsCat += "Shift";
    return shortcutsCat;
  }

  private isShortcutCategory(value: string): value is ShortcutCategory {
    return value in this.shortcuts;
  }

  private applyPendingAccent(cmd: string) {
    if (this.container.dataset.isNextCircum === "true") {
      cmd = this.addCircum(cmd);
      this.container.dataset.isNextCircum = "false";
    }
    if (this.container.dataset.isNextTrema === "true") {
      cmd = this.addTrema(cmd);
      this.container.dataset.isNextTrema = "false";
    }
    if (this.container.dataset.isNextAcute === "true") {
      cmd = this.addAcute(cmd);
      this.container.dataset.isNextAcute = "false";
    }
    if (this.container.dataset.isNextGrave === "true") {
      cmd = this.addGrave(cmd);
      this.container.dataset.isNextGrave = "false";
    }
    if (this.container.dataset.isNextCaron === "true") {
      cmd = this.addCaron(cmd);
      this.container.dataset.isNextCaron = "false";
    }
    if (this.container.dataset.isNextBar === "true") {
      cmd = this.addBar(cmd);
      this.container.dataset.isNextBar = "false";
    }
    if (this.container.dataset.isNextBreve === "true") {
      cmd = this.addBreve(cmd);
      this.container.dataset.isNextBreve = "false";
    }
    if (this.container.dataset.isNextTilde === "true") {
      cmd = this.addTilde(cmd);
      this.container.dataset.isNextTilde = "false";
    }
    if (this.container.dataset.isNextMacron === "true") {
      cmd = this.addMacron(cmd);
      this.container.dataset.isNextMacron = "false";
    }
    if (this.container.dataset.isNextCedilla === "true") {
      cmd = this.addCedilla(cmd);
      this.container.dataset.isNextCedilla = "true";
    }
    if (this.container.dataset.isNextOverring === "true") {
      cmd = this.addOverring(cmd);
      this.container.dataset.isNextOverring = "false";
    }
    if (this.container.dataset.isNextGreek === "true") {
      cmd = this.toGreek(cmd);
      this.container.dataset.isNextGreek = "false";
    }
    if (this.container.dataset.isNextIotasub === "true") {
      cmd = this.addIotasub(cmd);
      this.container.dataset.isNextIotasub = "false";
    }
    return cmd;
  }

  private handleEscapedCommand(cmd: string) {
    if (!cmd.startsWith("ESCAPED|-- ")) return false;
    switch (cmd.substring(11)) {
      case "CAPSLCK: ON":
        this.container.dataset.isCapsLckOn = "true";
        return true;
      case "CAPSLCK: OFF":
        this.container.dataset.isCapsLckOn = "false";
        return true;
      case "FN: ON":
        this.container.dataset.isFnOn = "true";
        return true;
      case "FN: OFF":
        this.container.dataset.isFnOn = "false";
        return true;
      case "CIRCUM":
        this.container.dataset.isNextCircum = "true";
        return true;
      case "TREMA":
        this.container.dataset.isNextTrema = "true";
        return true;
      case "ACUTE":
        this.container.dataset.isNextAcute = "true";
        return true;
      case "GRAVE":
        this.container.dataset.isNextGrave = "true";
        return true;
      case "CARON":
        this.container.dataset.isNextCaron = "true";
        return true;
      case "BAR":
        this.container.dataset.isNextBar = "true";
        return true;
      case "BREVE":
        this.container.dataset.isNextBreve = "true";
        return true;
      case "TILDE":
        this.container.dataset.isNextTilde = "true";
        return true;
      case "MACRON":
        this.container.dataset.isNextMacron = "true";
        return true;
      case "CEDILLA":
        this.container.dataset.isNextCedilla = "true";
        return true;
      case "OVERRING":
        this.container.dataset.isNextOverring = "true";
        return true;
      case "GREEK":
        this.container.dataset.isNextGreek = "true";
        return true;
      case "IOTASUB":
        this.container.dataset.isNextIotasub = "true";
        return true;
      default:
        return false;
    }
  }

  private writeToTerm(cmd: string, linebreak: boolean) {
    const term = window.term?.[window.currentTerm || 0];
    if (linebreak) {
      term?.writelr?.(cmd);
    } else {
      term?.write?.(cmd);
    }
  }

  private writeToActiveElement(cmd: string) {
    const active = document.activeElement as EditableElement | null;
    let isDelete = false;
    if (typeof active?.value !== "undefined") {
      switch (cmd) {
        case "\b":
          active.value = active.value.slice(0, -1);
          isDelete = true;
          break;
        case "\x1BOD":
          active.selectionStart = Math.max((active.selectionStart || 0) - 1, 0);
          active.selectionEnd = active.selectionStart;
          break;
        case "\x1BOC":
          active.selectionEnd = (active.selectionEnd || 0) + 1;
          active.selectionStart = active.selectionEnd;
          break;
        default:
          if (!this.ctrlseq.includes(cmd.slice(0, 1))) active.value = active.value + cmd;
      }
    }
    active?.dispatchEvent(new CustomEvent("input", { detail: isDelete ? "delete" : "insert" }));
    (active as HTMLElement | null)?.focus();
  }

  private focusTerm() {
    if (this.linkedToTerm) window.term?.[window.currentTerm || 0]?.term?.focus?.();
  }

  private playAudio(name: string) {
    if (this.container.dataset.passwordMode === "false") window.audioManager?.[name]?.play();
  }

  private allKeys(selector = "") {
    return Array.from(this.container.querySelectorAll<KeyboardKeyElement>(`.keyboard_key${selector}`));
  }

  private enterKeys() {
    return Array.from(this.container.querySelectorAll<KeyboardKeyElement>(".keyboard_enter"));
  }

  private closestKey(target: EventTarget | null) {
    return target instanceof Element ? (target.closest(".keyboard_key") as KeyboardKeyElement | null) : null;
  }

  private findKeyByDataset(property: string, value: string) {
    return this.allKeys().find((key) => key.dataset[property] === value) || null;
  }

  private addCircum(char: string) {
    return mapChar({ a: "â", A: "Â", z: "ẑ", Z: "Ẑ", e: "ê", E: "Ê", y: "ŷ", Y: "Ŷ", u: "û", U: "Û", i: "î", I: "Î", o: "ô", O: "Ô", s: "ŝ", S: "Ŝ", g: "ĝ", G: "Ĝ", h: "ĥ", H: "Ĥ", j: "ĵ", J: "Ĵ", w: "ŵ", W: "Ŵ", c: "ĉ", C: "Ĉ", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "0": "⁰" }, char);
  }

  private addTrema(char: string) {
    return mapChar({ a: "ä", A: "Ä", e: "ë", E: "Ë", t: "ẗ", y: "ÿ", Y: "Ÿ", u: "ü", U: "Ü", i: "ï", I: "Ï", o: "ö", O: "Ö", h: "ḧ", H: "Ḧ", w: "ẅ", W: "Ẅ", x: "ẍ", X: "Ẍ" }, char);
  }

  private addAcute(char: string) {
    return mapChar({ a: "á", A: "Á", c: "ć", C: "Ć", e: "é", E: "E", g: "ǵ", G: "Ǵ", i: "í", I: "Í", j: "ȷ́", J: "J́", k: "ḱ", K: "Ḱ", l: "ĺ", L: "Ĺ", m: "ḿ", M: "Ḿ", n: "ń", N: "Ń", o: "ó", O: "Ó", p: "ṕ", P: "Ṕ", r: "ŕ", R: "Ŕ", s: "ś", S: "Ś", u: "ú", U: "Ú", v: "v́", V: "V́", w: "ẃ", W: "Ẃ", y: "ý", Y: "Ý", z: "ź", Z: "Ź", ê: "ế", Ê: "Ế", ç: "ḉ", Ç: "Ḉ" }, char);
  }

  private addGrave(char: string) {
    return mapChar({ a: "à", A: "À", e: "è", E: "È", i: "ì", I: "Ì", m: "m̀", M: "M̀", n: "ǹ", N: "Ǹ", o: "ò", O: "Ò", u: "ù", U: "Ù", v: "v̀", V: "V̀", w: "ẁ", W: "Ẁ", y: "ỳ", Y: "Ỳ", ê: "ề", Ê: "Ề" }, char);
  }

  private addCaron(char: string) {
    return mapChar({ a: "ǎ", A: "Ǎ", c: "č", C: "Č", d: "ď", D: "Ď", e: "ě", E: "Ě", g: "ǧ", G: "Ǧ", h: "ȟ", H: "Ȟ", i: "ǐ", I: "Ǐ", j: "ǰ", k: "ǩ", K: "Ǩ", l: "ľ", L: "Ľ", n: "ň", N: "Ň", o: "ǒ", O: "Ǒ", r: "ř", R: "Ř", s: "š", S: "Š", t: "ť", T: "Ť", u: "ǔ", U: "Ǔ", z: "ž", Z: "Ž", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "0": "₀" }, char);
  }

  private addBar(char: string) {
    return mapChar({ a: "ⱥ", A: "Ⱥ", b: "ƀ", B: "Ƀ", c: "ȼ", C: "Ȼ", d: "đ", D: "Đ", e: "ɇ", E: "Ɇ", g: "ǥ", G: "Ǥ", h: "ħ", H: "Ħ", i: "ɨ", I: "Ɨ", j: "ɉ", J: "Ɉ", l: "ł", L: "Ł", o: "ø", O: "Ø", p: "ᵽ", P: "Ᵽ", r: "ɍ", R: "Ɍ", t: "ŧ", T: "Ŧ", u: "ʉ", U: "Ʉ", y: "ɏ", Y: "Ɏ", z: "ƶ", Z: "Ƶ" }, char);
  }

  private addBreve(char: string) {
    return mapChar({ a: "ă", A: "Ă", e: "ĕ", E: "Ĕ", g: "ğ", G: "Ğ", i: "ĭ", I: "Ĭ", o: "ŏ", O: "Ŏ", u: "ŭ", U: "Ŭ", à: "ằ", À: "Ằ" }, char);
  }

  private addTilde(char: string) {
    return mapChar({ a: "ã", A: "Ã", e: "ẽ", E: "Ẽ", i: "ĩ", I: "Ĩ", n: "ñ", N: "Ñ", o: "õ", O: "Õ", u: "ũ", U: "Ũ", v: "ṽ", V: "Ṽ", y: "ỹ", Y: "Ỹ", ê: "ễ", Ê: "Ễ" }, char);
  }

  private addMacron(char: string) {
    return mapChar({ a: "ā", A: "Ā", e: "ē", E: "Ē", g: "ḡ", G: "Ḡ", i: "ī", I: "Ī", o: "ō", O: "Ō", u: "ū", U: "Ū", y: "ȳ", Y: "Ȳ", é: "ḗ", É: "Ḗ", è: "ḕ", È: "Ḕ" }, char);
  }

  private addCedilla(char: string) {
    return mapChar({ c: "ç", C: "Ç", d: "ḑ", D: "Ḑ", e: "ȩ", E: "Ȩ", g: "ģ", G: "Ģ", h: "ḩ", H: "Ḩ", k: "ķ", K: "Ķ", l: "ļ", L: "Ļ", n: "ņ", N: "Ņ", r: "ŗ", R: "Ŗ", s: "ş", S: "Ş", t: "ţ", T: "Ţ" }, char);
  }

  private addOverring(char: string) {
    return mapChar({ a: "å", A: "Å", u: "ů", U: "Ů", w: "ẘ", y: "ẙ" }, char);
  }

  private toGreek(char: string) {
    return mapChar({ b: "β", p: "π", P: "Π", d: "δ", D: "Δ", l: "λ", L: "Λ", j: "θ", J: "Θ", z: "ζ", w: "ω", W: "Ω", A: "α", u: "υ", U: "Υ", i: "ι", e: "ε", t: "τ", s: "σ", S: "Σ", r: "ρ", R: "Ρ", n: "ν", m: "μ", y: "ψ", Y: "Ψ", x: "ξ", X: "Ξ", k: "κ", q: "χ", Q: "Χ", g: "γ", G: "Γ", h: "η", f: "φ", F: "Φ" }, char);
  }

  private addIotasub(char: string) {
    return mapChar({ o: "ǫ", O: "Ǫ", a: "ą", A: "Ą", u: "ų", U: "Ų", i: "į", I: "Į", e: "ę", E: "Ę" }, char);
  }
}

import type { FilesystemBlock } from "./filesystem";
import { Modal } from "./modal";
import type { TauriTerminal } from "./terminal";

declare global {
  interface Window {
    activeFuzzyFinder?: FuzzyFinder;
  }
}

function activeTerminal() {
  return window.term?.[window.currentTerm || 0] as TauriTerminal | undefined;
}

function resolvePath(dir: string, file: string) {
  const separator = dir.includes("\\") ? "\\" : "/";
  if (dir.endsWith(separator)) return `${dir}${file}`;
  return `${dir}${separator}${file}`;
}

function quoteShellPath(path: string) {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

export class FuzzyFinder {
  private readonly disp: Modal;
  private readonly input: HTMLInputElement;
  private readonly results: HTMLUListElement;
  private matches: FilesystemBlock[] = [];

  constructor() {
    if (document.getElementById("fuzzyFinder") || document.getElementById("settingsEditor")) {
      throw new Error("fuzzy finder is already open");
    }

    window.keyboard?.detach();

    this.disp = new Modal(
      {
        type: "custom",
        title: "Fuzzy cwd file search",
        html: `<input type="search" id="fuzzyFinder" placeholder="Search file in cwd..." />
          <ul id="fuzzyFinder-results">
            <li class="fuzzyFinderMatchSelected"></li>
            <li></li>
            <li></li>
            <li></li>
            <li></li>
          </ul>`,
        buttons: [{ label: "Select", action: () => this.submit() }],
      },
      () => {
        delete window.activeFuzzyFinder;
        window.keyboard?.attach();
        activeTerminal()?.term.focus();
      },
    );

    const input = document.getElementById("fuzzyFinder");
    const results = document.getElementById("fuzzyFinder-results");
    if (!(input instanceof HTMLInputElement) || !(results instanceof HTMLUListElement)) {
      throw new Error("fuzzy finder DOM failed to initialize");
    }

    this.input = input;
    this.results = results;

    this.input.addEventListener("input", (event) => {
      const inputEvent = event as InputEvent;
      if (inputEvent.inputType?.startsWith("delete")) {
        this.input.value = "";
        this.search("");
      } else {
        this.search(this.input.value);
      }
    });
    this.input.addEventListener("keydown", (event) => this.onKeydown(event));

    this.search("");
    this.input.focus();
  }

  search(text: string) {
    let count = 0;
    const needle = text.toLowerCase();
    const files = window.fsDisp?.cwd || [];
    const results = files.filter((file) => {
      if (count >= 5 || file.entryType === "showDisks" || file.entryType === "up") return false;
      if (!file.name.toLowerCase().includes(needle)) return false;
      count += 1;
      return true;
    });

    results.sort((left, right) => {
      const leftStarts = left.name.toLowerCase().startsWith(needle);
      const rightStarts = right.name.toLowerCase().startsWith(needle);
      if (leftStarts && !rightStarts) return -1;
      if (!leftStarts && rightStarts) return 1;
      return 0;
    });

    this.matches = results;
    this.results.replaceChildren();

    if (results.length === 0) {
      this.results.appendChild(this.resultElement("No results", 0, true));
    } else {
      results.forEach((file, index) => {
        this.results.appendChild(this.resultElement(file.name, index, index === 0));
      });
    }

    for (let index = this.results.children.length; index < 5; index += 1) {
      this.results.appendChild(document.createElement("li"));
    }
  }

  submit() {
    const selected = this.selectedIndex();
    const file = this.matches[selected];
    if (!file) {
      this.disp.close();
      return;
    }

    activeTerminal()?.write(quoteShellPath(file.path || resolvePath(window.fsDisp?.dirpath || "", file.name)));
    this.disp.close();
  }

  private onKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case "Enter":
        this.submit();
        event.preventDefault();
        break;
      case "ArrowDown":
        this.selectNext(1);
        event.preventDefault();
        break;
      case "ArrowUp":
        this.selectNext(-1);
        event.preventDefault();
        break;
      default:
        break;
    }
  }

  private selectedIndex() {
    const selected = this.results.querySelector("li.fuzzyFinderMatchSelected");
    if (!selected?.id.startsWith("fuzzyFinderMatch-")) return 0;
    return Number(selected.id.slice(17)) || 0;
  }

  private selectNext(direction: 1 | -1) {
    const selected = this.results.querySelector("li.fuzzyFinderMatchSelected");
    const selectedIndex = this.selectedIndex();
    const nextIndex = document.getElementById(`fuzzyFinderMatch-${selectedIndex + direction}`) ? selectedIndex + direction : 0;
    const next = document.getElementById(`fuzzyFinderMatch-${nextIndex}`);
    if (!selected || !next) return;

    selected.removeAttribute("class");
    next.setAttribute("class", "fuzzyFinderMatchSelected");
  }

  private resultElement(text: string, index: number, selected: boolean) {
    const item = document.createElement("li");
    item.id = `fuzzyFinderMatch-${index}`;
    if (selected) item.className = "fuzzyFinderMatchSelected";
    item.textContent = text;
    item.addEventListener("click", () => {
      this.results.querySelector("li.fuzzyFinderMatchSelected")?.removeAttribute("class");
      item.className = "fuzzyFinderMatchSelected";
    });
    return item;
  }
}

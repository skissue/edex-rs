type ModalButton = {
  label: string;
  action: () => void;
};

type ModalOptions = {
  type: "error" | "warning" | "custom" | string;
  title?: string;
  message?: string;
  html?: string;
  buttons?: ModalButton[];
};

type ModalElement = HTMLDivElement & {
  zindex?: string | null;
  posX?: number;
  posY?: number;
  lastMouseX?: number;
  lastMouseY?: number;
};

declare global {
  interface Window {
    modals: Record<string, Modal | Record<string, never>>;
  }
}

function modalId() {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function playAudio(name: string) {
  window.audioManager?.[name]?.play();
}

export class Modal {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly classes: string;

  private readonly onclose?: () => void;

  constructor(options: ModalOptions, onclose?: () => void) {
    if (!options || !options.type) throw new Error("Missing parameters");

    window.modals ||= {};

    this.type = options.type;
    this.id = this.nextId();
    this.title = options.title || options.type || "Modal window";
    this.message = options.message || "Lorem ipsum dolor sit amet.";
    this.onclose = onclose;

    let classes = "modal_popup";
    let buttons: ModalButton[] = [];
    const augs: string[] = [];
    let zindex = 0;

    window.modals[this.id] = {};

    switch (this.type) {
      case "error":
        classes += " error";
        zindex = 1500;
        buttons.push({ label: "PANIC", action: () => this.close() }, { label: "RELOAD", action: () => window.location.reload() });
        augs.push("tr-clip", "bl-rect", "r-clip");
        break;
      case "warning":
        classes += " warning";
        zindex = 1000;
        buttons.push({ label: "OK", action: () => this.close() });
        augs.push("bl-clip", "tr-clip", "r-rect", "b-rect");
        break;
      case "custom":
        classes += " info custom";
        zindex = 500;
        buttons = [...(options.buttons || [])];
        buttons.push({ label: "Close", action: () => this.close() });
        augs.push("tr-clip", "bl-clip");
        break;
      default:
        classes += " info";
        zindex = 500;
        buttons.push({ label: "OK", action: () => this.close() });
        augs.push("tr-clip", "bl-clip");
        break;
    }

    this.classes = classes;

    const element = document.createElement("div") as ModalElement;
    element.id = `modal_${this.id}`;
    element.className = this.classes;
    element.setAttribute("style", `z-index:${zindex + Object.keys(window.modals).length};`);
    element.setAttribute("augmented-ui", `${augs.join(" ")} exe`);

    const title = document.createElement("h1");
    title.textContent = this.title;
    element.appendChild(title);

    if (this.type === "custom") {
      const custom = document.createElement("div");
      custom.innerHTML = options.html || "";
      element.append(...Array.from(custom.childNodes));
    } else {
      const message = document.createElement("h5");
      message.textContent = this.message;
      element.appendChild(message);
    }

    const buttonsContainer = document.createElement("div");
    buttons.forEach((button) => {
      const buttonElement = document.createElement("button");
      buttonElement.textContent = button.label;
      buttonElement.addEventListener("click", button.action);
      buttonsContainer.appendChild(buttonElement);
    });
    element.appendChild(buttonsContainer);

    element.addEventListener("mousedown", () => this.focus());
    element.addEventListener("touchstart", () => this.focus());

    if (this.type === "error") playAudio("error");
    else if (this.type === "warning") playAudio("alarm");
    else playAudio("info");

    window.modals[this.id] = this;
    document.body.appendChild(element);
    this.focus();
    this.attachDragHandlers(element, title);
  }

  close() {
    const modalElement = document.getElementById(`modal_${this.id}`);
    modalElement?.setAttribute("class", `modal_popup ${this.type} blink`);
    playAudio("denied");
    window.setTimeout(() => {
      modalElement?.remove();
      delete window.modals[this.id];
    }, 100);

    this.onclose?.();
  }

  focus() {
    const modalElement = document.getElementById(`modal_${this.id}`);
    modalElement?.setAttribute("class", `${this.classes} focus`);
    Object.keys(window.modals).forEach((id) => {
      if (id !== this.id) (window.modals[id] as Modal).unfocus?.();
    });
  }

  unfocus() {
    const modalElement = document.getElementById(`modal_${this.id}`);
    modalElement?.setAttribute("class", this.classes);
  }

  private nextId() {
    let id = modalId();
    while (typeof window.modals?.[id] !== "undefined") id = modalId();
    return id;
  }

  private attachDragHandlers(draggedModal: ModalElement, dragTarget: HTMLElement) {
    draggedModal.zindex = draggedModal.getAttribute("style");

    window.setTimeout(() => {
      const rect = draggedModal.getBoundingClientRect();
      draggedModal.posX = rect.left;
      draggedModal.posY = rect.top;
    }, 500);

    const move = (clientX: number, clientY: number) => {
      draggedModal.posX = (draggedModal.posX || 0) + (clientX - (draggedModal.lastMouseX || clientX));
      draggedModal.posY = (draggedModal.posY || 0) + (clientY - (draggedModal.lastMouseY || clientY));
      draggedModal.lastMouseX = clientX;
      draggedModal.lastMouseY = clientY;
      draggedModal.setAttribute(
        "style",
        `${draggedModal.zindex}background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.5);left: ${draggedModal.posX}px;top: ${draggedModal.posY}px;`,
      );
    };

    const mousemove = (event: MouseEvent) => move(event.clientX, event.clientY);
    const mouseup = () => {
      window.removeEventListener("mousemove", mousemove);
      draggedModal.setAttribute("style", `${draggedModal.zindex}left: ${draggedModal.posX}px;top: ${draggedModal.posY}px;`);
      window.removeEventListener("mouseup", mouseup);
    };

    dragTarget.addEventListener("mousedown", (event) => {
      draggedModal.lastMouseX = event.clientX;
      draggedModal.lastMouseY = event.clientY;
      move(event.clientX, event.clientY);
      window.addEventListener("mousemove", mousemove);
      window.addEventListener("mouseup", mouseup);
    });

    const touchmove = (event: TouchEvent) => move(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
    const touchend = () => {
      window.removeEventListener("touchmove", touchmove);
      draggedModal.setAttribute("style", `${draggedModal.zindex}left: ${draggedModal.posX}px;top: ${draggedModal.posY}px;`);
      window.removeEventListener("touchend", touchend);
    };

    dragTarget.addEventListener("touchstart", (event) => {
      draggedModal.lastMouseX = event.changedTouches[0].clientX;
      draggedModal.lastMouseY = event.changedTouches[0].clientY;
      move(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
      window.addEventListener("touchmove", touchmove);
      window.addEventListener("touchend", touchend);
    });
  }
}

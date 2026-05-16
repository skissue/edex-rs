import { getNetworkStats } from "./backend";

type NetstatLike = {
  offline: boolean;
  iface: string | null;
};

const HISTORY_LENGTH = 90;

export class Conninfo {
  private parent: HTMLElement;
  private element: HTMLElement;
  private current: HTMLElement | null;
  private total: HTMLElement | null;
  private series: [number[], number[]] = [[], []];
  private infoUpdater: number;
  private currentlyUpdating = false;

  constructor(parentId: string) {
    if (!parentId) throw new Error("Missing parameters");

    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Missing connection info parent: ${parentId}`);
    this.parent = parent;

    this.element = document.createElement("div");
    this.element.setAttribute("id", "mod_conninfo");
    this.element.setAttribute("style", "animation-play-state: running;");
    this.element.innerHTML = `<div id="mod_conninfo_innercontainer">
                <h1>NETWORK TRAFFIC<i>UP / DOWN, MB/S</i></h1>
                <h2>TOTAL<i>0B OUT, 0B IN</i></h2>
                <canvas id="mod_conninfo_canvas_top"></canvas>
                <canvas id="mod_conninfo_canvas_bottom"></canvas>
                <h3>OFFLINE</h3>
            </div>`;
    this.parent.insertBefore(this.element, document.getElementById("mod_globe"));

    this.current = document.querySelector("#mod_conninfo_innercontainer > h1 > i");
    this.total = document.querySelector("#mod_conninfo_innercontainer > h2 > i");

    this.updateCanvasSize();
    window.addEventListener("resize", () => this.updateCanvasSize());

    void this.updateInfo();
    this.infoUpdater = window.setInterval(() => {
      void this.updateInfo();
    }, 1000);
  }

  async updateInfo() {
    if (this.currentlyUpdating) return;
    this.currentlyUpdating = true;

    try {
      const netstat = window.mods.netstat as NetstatLike | undefined;
      if (netstat?.offline !== false || netstat.iface === null) {
        this.appendPoint(0, 0);
        this.element.setAttribute("class", "offline");
        return;
      }

      const data = await getNetworkStats(netstat.iface);
      if (!data) {
        this.appendPoint(0, 0);
        this.element.setAttribute("class", "offline");
        return;
      }

      this.element.setAttribute("class", "");
      const up = data.txSec / 125000;
      const down = data.rxSec / 125000;
      this.appendPoint(up, down);

      if (this.total) this.total.innerText = `${this.prettyBytes(data.txBytes)} OUT, ${this.prettyBytes(data.rxBytes)} IN`.toUpperCase();
      if (this.current) this.current.innerText = `UP ${up.toFixed(2)} DOWN ${down.toFixed(2)}`;
    } catch (error) {
      console.error("Failed to update network traffic info", error);
      this.appendPoint(0, 0);
      this.element.setAttribute("class", "offline");
    } finally {
      this.currentlyUpdating = false;
    }
  }

  private appendPoint(up: number, down: number) {
    this.series[0].push(up);
    this.series[1].push(down);
    this.series[0] = this.series[0].slice(-HISTORY_LENGTH);
    this.series[1] = this.series[1].slice(-HISTORY_LENGTH);
    this.drawChart("mod_conninfo_canvas_top", this.series[0], 1);
    this.drawChart("mod_conninfo_canvas_bottom", this.series[1], -1);
  }

  private drawChart(id: string, values: number[], direction: 1 | -1) {
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const width = canvas.width;
    const height = canvas.height;
    const max = Math.max(...this.series[0], ...this.series[1], 0.01);
    const color = `rgb(${window.theme?.r ?? 170},${window.theme?.g ?? 207},${window.theme?.b ?? 209})`;
    const gridColor = `rgba(${window.theme?.r ?? 170},${window.theme?.g ?? 207},${window.theme?.b ?? 209},0.4)`;

    context.clearRect(0, 0, width, height);
    context.strokeStyle = gridColor;
    context.lineWidth = 1;
    for (let i = 1; i <= 3; i += 1) {
      const y = (height / 4) * i;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / Math.max(HISTORY_LENGTH - 1, 1)) * width;
      const normalized = Math.max(0, Math.min(1, value / max));
      const y = direction === 1 ? height - normalized * height : normalized * height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }

  private updateCanvasSize() {
    ["mod_conninfo_canvas_top", "mod_conninfo_canvas_bottom"].forEach((id) => {
      const canvas = document.getElementById(id) as HTMLCanvasElement | null;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(Math.floor(rect.width * window.devicePixelRatio), 1);
      canvas.height = Math.max(Math.floor(rect.height * window.devicePixelRatio), 1);
    });
    this.appendPoint(0, 0);
  }

  private prettyBytes(value: number) {
    if (value < 1000) return `${value} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let unitIndex = -1;
    let next = value;
    do {
      next /= 1000;
      unitIndex += 1;
    } while (next >= 1000 && unitIndex < units.length - 1);
    return `${next.toFixed(next >= 10 ? 1 : 2)} ${units[unitIndex]}`;
  }

  destroy() {
    window.clearInterval(this.infoUpdater);
  }
}

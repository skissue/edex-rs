import { getCpuMetrics, type CpuMetrics } from "./backend";

const HISTORY_LENGTH = 80;

export class Cpuinfo {
  private parent: HTMLElement;
  private container: HTMLElement;
  private divide = 1;
  private histories: number[][] = [];
  private metricsUpdater: number | null = null;
  private currentlyUpdating = false;

  constructor(parentId: string) {
    if (!parentId) throw new Error("Missing parameters");

    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Missing CPU info parent: ${parentId}`);
    this.parent = parent;

    this.container = document.createElement("div");
    this.container.setAttribute("id", "mod_cpuinfo");
    this.container.setAttribute("style", "animation-play-state: running;");
    this.parent.append(this.container);

    void this.init().catch((error) => {
      console.error("Failed to initialize CPU info", error);
    });
  }

  private async init() {
    const data = await getCpuMetrics();
    const cores = Math.max(data.cores, 1);
    const divide = Math.max(Math.floor(cores / 2), 1);
    this.divide = divide;
    this.histories = Array.from({ length: cores }, () => []);

    const cpuName = this.trimCpuName(data.vendor, data.brand);
    this.container.innerHTML = `<div id="mod_cpuinfo_innercontainer">
            <h1>CPU USAGE<i>${window._escapeHtml(cpuName)}</i></h1>
            <div>
                <h1># <em>1</em> - <em>${divide}</em><br>
                <i id="mod_cpuinfo_usagecounter0">Avg. --%</i></h1>
                <canvas id="mod_cpuinfo_canvas_0" height="60"></canvas>
            </div>
            <div>
                <h1># <em>${divide + 1}</em> - <em>${cores}</em><br>
                <i id="mod_cpuinfo_usagecounter1">Avg. --%</i></h1>
                <canvas id="mod_cpuinfo_canvas_1" height="60"></canvas>
            </div>
            <div>
                <div>
                    <h1>TEMP<br>
                    <i id="mod_cpuinfo_temp">--&deg;C</i></h1>
                </div>
                <div>
                    <h1>SPD<br>
                    <i id="mod_cpuinfo_speed_min">--GHz</i></h1>
                </div>
                <div>
                    <h1>MAX<br>
                    <i id="mod_cpuinfo_speed_max">--GHz</i></h1>
                </div>
                <div>
                    <h1>TASKS<br>
                    <i id="mod_cpuinfo_tasks">---</i></h1>
                </div>
            </div>
        </div>`;

    this.updateFromMetrics(data);
    this.metricsUpdater = window.setInterval(() => {
      void this.updateInfo();
    }, 1500);
  }

  async updateInfo() {
    if (this.currentlyUpdating) return;
    this.currentlyUpdating = true;
    try {
      this.updateFromMetrics(await getCpuMetrics());
    } catch (error) {
      console.error("Failed to update CPU info", error);
    } finally {
      this.currentlyUpdating = false;
    }
  }

  updateCPUload() {
    return this.updateInfo();
  }

  updateCPUtemp() {
    return this.updateInfo();
  }

  updateCPUspeed() {
    return this.updateInfo();
  }

  updateCPUtasks() {
    return this.updateInfo();
  }

  private updateFromMetrics(metrics: CpuMetrics) {
    this.updateLoad(metrics.loads);
    this.updateTemp(metrics.temperatureCelsius);
    this.updateSpeed(metrics.speedGhz, metrics.speedMaxGhz);
    this.updateTasks(metrics.tasks);
  }

  private updateLoad(loads: number[]) {
    while (this.histories.length < loads.length) this.histories.push([]);

    loads.forEach((load, index) => {
      this.histories[index].push(load);
      this.histories[index] = this.histories[index].slice(-HISTORY_LENGTH);
    });

    const groups = [loads.slice(0, this.divide), loads.slice(this.divide)];
    if (groups[1].length === 0) groups[1] = groups[0];

    groups.forEach((stats, index) => {
      const average = stats.length > 0 ? Math.round(stats.reduce((a, b) => a + b, 0) / stats.length) : 0;
      const counter = document.getElementById(`mod_cpuinfo_usagecounter${index}`);
      if (counter) counter.innerText = `Avg. ${average}%`;
      this.drawChart(index);
    });
  }

  private updateTemp(temperature: number | null) {
    const element = document.getElementById("mod_cpuinfo_temp");
    if (element) element.innerText = temperature === null ? "--\u00b0C" : `${Math.round(temperature)}\u00b0C`;
  }

  private updateSpeed(speed: number, speedMax: number) {
    const min = document.getElementById("mod_cpuinfo_speed_min");
    const max = document.getElementById("mod_cpuinfo_speed_max");
    if (min) min.innerText = `${this.formatGhz(speed)}GHz`;
    if (max) max.innerText = `${this.formatGhz(speedMax)}GHz`;
  }

  private updateTasks(tasks: number) {
    const element = document.getElementById("mod_cpuinfo_tasks");
    if (element) element.innerText = `${tasks}`;
  }

  private drawChart(index: number) {
    const canvas = document.getElementById(`mod_cpuinfo_canvas_${index}`) as HTMLCanvasElement | null;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const width = canvas.width;
    const height = canvas.height;
    const color = `rgb(${window.theme?.r ?? 170},${window.theme?.g ?? 207},${window.theme?.b ?? 209})`;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    const start = index === 0 ? 0 : this.divide;
    const end = index === 0 ? this.divide : this.histories.length;
    this.histories.slice(start, end).forEach((history) => {
      context.beginPath();
      history.forEach((value, pointIndex) => {
        const x = (pointIndex / Math.max(HISTORY_LENGTH - 1, 1)) * width;
        const y = height - (Math.max(0, Math.min(100, value)) / 100) * height;
        if (pointIndex === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    });
  }

  private formatGhz(value: number) {
    return (Math.round(value * 100) / 100).toString();
  }

  private trimCpuName(vendor: string, brand: string) {
    let manufacturer = vendor.trim();
    if (/authenticamd/i.test(manufacturer) || /^AMD\b/i.test(brand)) manufacturer = "AMD";
    if (/genuineintel/i.test(manufacturer) || /^Intel\b/i.test(brand)) manufacturer = "Intel";

    const normalizedBrand = brand.trim().replace(new RegExp(`^${manufacturer}\\s+`, "i"), "");
    let cpuName = `${manufacturer}${normalizedBrand}`.substr(0, 30);
    const lastSpace = cpuName.lastIndexOf(" ");
    if (lastSpace > 0 && cpuName.length === 30) cpuName = cpuName.substr(0, lastSpace);
    return cpuName;
  }

  destroy() {
    if (this.metricsUpdater !== null) window.clearInterval(this.metricsUpdater);
  }
}

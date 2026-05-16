import { getMemoryMetrics } from "./backend";

const POINT_COUNT = 440;
const BYTES_PER_GIB = 1_073_742_000;

export class RAMwatcher {
  private parent: HTMLElement;
  private points: Element[] = [];
  private currentlyUpdating = false;
  private infoUpdater: number;

  constructor(parentId: string) {
    if (!parentId) throw new Error("Missing parameters");

    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Missing RAM watcher parent: ${parentId}`);
    this.parent = parent;

    const modExtContainer = document.createElement("div");
    let ramwatcherDOM = `<div id="mod_ramwatcher_inner">
                <h1>MEMORY<i id="mod_ramwatcher_info"></i></h1>
                <div id="mod_ramwatcher_pointmap">`;

    for (let i = 0; i < POINT_COUNT; i += 1) {
      ramwatcherDOM += `<div class="mod_ramwatcher_point free"></div>`;
    }

    ramwatcherDOM += `</div>
                <div id="mod_ramwatcher_swapcontainer">
                    <h1>SWAP</h1>
                    <progress id="mod_ramwatcher_swapbar" max="100" value="0"></progress>
                    <h3 id="mod_ramwatcher_swaptext">0.0 GiB</h3>
                </div>
        </div>`;

    modExtContainer.innerHTML = ramwatcherDOM;
    modExtContainer.setAttribute("id", "mod_ramwatcher");
    modExtContainer.setAttribute("style", "animation-play-state: running;");
    this.parent.append(modExtContainer);

    this.points = Array.from(document.querySelectorAll("div.mod_ramwatcher_point"));
    this.shuffleArray(this.points);

    void this.updateInfo();
    this.infoUpdater = window.setInterval(() => {
      void this.updateInfo();
    }, 1500);
  }

  async updateInfo() {
    if (this.currentlyUpdating) return;
    this.currentlyUpdating = true;

    try {
      const data = await getMemoryMetrics();
      if (data.total <= 0) return;

      const active = Math.round((POINT_COUNT * data.active) / data.total);
      const available = Math.round((POINT_COUNT * Math.max(data.available - data.free, 0)) / data.total);

      this.points.slice(0, active).forEach((domPoint) => {
        if (domPoint.getAttribute("class") !== "mod_ramwatcher_point active") {
          domPoint.setAttribute("class", "mod_ramwatcher_point active");
        }
      });
      this.points.slice(active, active + available).forEach((domPoint) => {
        if (domPoint.getAttribute("class") !== "mod_ramwatcher_point available") {
          domPoint.setAttribute("class", "mod_ramwatcher_point available");
        }
      });
      this.points.slice(active + available, this.points.length).forEach((domPoint) => {
        if (domPoint.getAttribute("class") !== "mod_ramwatcher_point free") {
          domPoint.setAttribute("class", "mod_ramwatcher_point free");
        }
      });

      const totalGiB = Math.round((data.total / BYTES_PER_GIB) * 10) / 10;
      const usedGiB = Math.round((data.active / BYTES_PER_GIB) * 10) / 10;
      const info = document.getElementById("mod_ramwatcher_info");
      if (info) info.innerText = `USING ${usedGiB} OUT OF ${totalGiB} GiB`;

      const usedSwap = data.swapTotal > 0 ? Math.round((100 * data.swapUsed) / data.swapTotal) : 0;
      const swapBar = document.getElementById("mod_ramwatcher_swapbar") as HTMLProgressElement | null;
      if (swapBar) swapBar.value = usedSwap || 0;

      const usedSwapGiB = Math.round((data.swapUsed / BYTES_PER_GIB) * 10) / 10;
      const swapText = document.getElementById("mod_ramwatcher_swaptext");
      if (swapText) swapText.innerText = `${usedSwapGiB} GiB`;
    } catch (error) {
      console.error("Failed to update RAM watcher", error);
    } finally {
      this.currentlyUpdating = false;
    }
  }

  shuffleArray(array: Element[]) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  destroy() {
    window.clearInterval(this.infoUpdater);
  }
}

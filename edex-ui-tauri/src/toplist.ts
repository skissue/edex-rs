import { getProcessMetrics, type ProcessMetrics } from "./backend";

export class Toplist {
  private parent: HTMLElement;
  private element: HTMLElement;
  private currentlyUpdating = false;
  private listUpdater: number;

  constructor(parentId: string) {
    if (!parentId) throw new Error("Missing parameters");

    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Missing top list parent: ${parentId}`);
    this.parent = parent;

    this.element = document.createElement("div");
    this.element.setAttribute("id", "mod_toplist");
    this.element.setAttribute("style", "animation-play-state: running;");
    this.element.innerHTML = `<h1>TOP PROCESSES<i>PID | NAME | CPU | MEM</i></h1><br>
        <table id="mod_toplist_table"></table>`;
    this.parent.append(this.element);

    void this.updateList();
    this.listUpdater = window.setInterval(() => {
      void this.updateList();
    }, 2000);
  }

  async updateList() {
    if (this.currentlyUpdating) return;

    this.currentlyUpdating = true;
    try {
      let list = await getProcessMetrics();
      if (window.settings.excludeThreadsFromToplist === true) {
        list = this.mergeThreadEntries(list);
      }

      list = list
        .sort((a, b) => (b.cpu - a.cpu) * 100 + b.mem - a.mem)
        .splice(0, 5);

      const table = document.getElementById("mod_toplist_table");
      if (!table) return;
      table.querySelectorAll(":scope > tr").forEach((el) => el.remove());

      list.forEach((proc) => {
        const el = document.createElement("tr");
        el.innerHTML = `<td>${proc.pid}</td>
                                <td><strong>${window._escapeHtml(proc.name)}</strong></td>
                                <td>${Math.round(proc.cpu * 10) / 10}%</td>
                                <td>${Math.round(proc.mem * 10) / 10}%</td>`;
        table.append(el);
      });
    } catch (error) {
      console.error("Failed to update process top list", error);
    } finally {
      this.currentlyUpdating = false;
    }
  }

  private mergeThreadEntries(list: ProcessMetrics[]) {
    return [...list]
      .sort((a, b) => a.pid - b.pid)
      .filter((entry, index, array) => {
        const firstIndex = array.findIndex((candidate) => candidate.name === entry.name);
        if (firstIndex !== -1 && firstIndex !== index) {
          array[firstIndex].cpu += entry.cpu;
          array[firstIndex].mem += entry.mem;
          return false;
        }
        return true;
      });
  }

  destroy() {
    window.clearInterval(this.listUpdater);
  }
}

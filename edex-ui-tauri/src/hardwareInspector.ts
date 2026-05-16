import { getHardwareIdentity } from "./backend";

export class HardwareInspector {
  private parent: HTMLElement;
  private element: HTMLDivElement;
  private infoUpdater: number;

  constructor(parentId: string) {
    if (!parentId) throw new Error("Missing parameters");

    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Missing hardware inspector parent: ${parentId}`);
    this.parent = parent;

    this.element = document.createElement("div");
    this.element.setAttribute("id", "mod_hardwareInspector");
    this.element.setAttribute("style", "animation-play-state: running;");
    this.element.innerHTML = `<div id="mod_hardwareInspector_inner">
            <div>
                <h1>MANUFACTURER</h1>
                <h2 id="mod_hardwareInspector_manufacturer" >NONE</h2>
            </div>
            <div>
                <h1>MODEL</h1>
                <h2 id="mod_hardwareInspector_model" >NONE</h2>
            </div>
            <div>
                <h1>CHASSIS</h1>
                <h2 id="mod_hardwareInspector_chassis" >NONE</h2>
            </div>
        </div>`;

    const sysinfo = document.getElementById("mod_sysinfo");
    if (sysinfo?.parentElement === this.parent) {
      sysinfo.insertAdjacentElement("afterend", this.element);
    } else {
      this.parent.append(this.element);
    }

    void this.updateInfo().catch((error) => {
      console.error("Failed to update hardware identity", error);
    });
    this.infoUpdater = window.setInterval(() => {
      void this.updateInfo().catch((error) => {
        console.error("Failed to update hardware identity", error);
      });
    }, 20000);
  }

  async updateInfo() {
    const data = await getHardwareIdentity();

    const manufacturer = document.getElementById("mod_hardwareInspector_manufacturer");
    const model = document.getElementById("mod_hardwareInspector_model");
    const chassis = document.getElementById("mod_hardwareInspector_chassis");

    if (manufacturer) manufacturer.innerText = this.trimDataString(data.manufacturer);
    if (model) model.innerText = this.trimDataString(data.model, data.manufacturer, data.chassis);
    if (chassis) chassis.innerText = data.chassis;
  }

  private trimDataString(str: string, ...filters: string[]) {
    return str
      .trim()
      .split(" ")
      .filter((word) => !filters.includes(word))
      .slice(0, 2)
      .join(" ");
  }

  destroy() {
    window.clearInterval(this.infoUpdater);
  }
}

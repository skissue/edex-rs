import { getSysinfoSnapshot, type SysinfoSnapshot } from "./backend";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export class Sysinfo {
  private parent: HTMLElement;
  private updater: number;
  private batteryUpdater: number;

  constructor(parentId: string) {
    if (!parentId) throw new Error("Missing parameters");

    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Missing sysinfo parent: ${parentId}`);
    this.parent = parent;

    const existing = document.getElementById("mod_sysinfo");
    if (existing) {
      existing.innerHTML = this.render("?").trim();
    } else {
      this.parent.insertAdjacentHTML(
        "beforeend",
        `<div id="mod_sysinfo" style="animation-play-state: running;">
            ${this.render("?")}
        </div>`,
      );
    }

    this.updateDate();
    void this.updateSystemInfo();
    this.updater = window.setInterval(() => {
      void this.updateSystemInfo();
    }, 60000);
    this.batteryUpdater = window.setInterval(() => {
      void this.updateBattery();
    }, 3000);
  }

  private render(os: string) {
    return `<div>
                <h1>1970</h1>
                <h2>JAN 1</h2>
            </div>
            <div>
                <h1>UPTIME</h1>
                <h2>0:0:0</h2>
            </div>
            <div>
                <h1>TYPE</h1>
                <h2>${window._escapeHtml(os)}</h2>
            </div>
            <div>
                <h1>POWER</h1>
                <h2>00%</h2>
            </div>`;
  }

  updateDate() {
    const time = new Date();

    const year = document.querySelector<HTMLElement>("#mod_sysinfo > div:first-child > h1");
    if (year) year.innerHTML = time.getFullYear().toString();

    const date = document.querySelector<HTMLElement>("#mod_sysinfo > div:first-child > h2");
    if (date) date.innerHTML = `${MONTHS[time.getMonth()]} ${time.getDate()}`;

    const timeToNewDay = (23 - time.getHours()) * 3600000 + (59 - time.getMinutes()) * 60000;
    window.setTimeout(() => {
      this.updateDate();
    }, timeToNewDay);
  }

  async updateSystemInfo() {
    const snapshot = await getSysinfoSnapshot();
    this.updateUptime(snapshot);
    this.updateType(snapshot);
    this.renderBattery(snapshot);
  }

  async updateBattery() {
    const snapshot = await getSysinfoSnapshot();
    this.renderBattery(snapshot);
  }

  private updateType(snapshot: SysinfoSnapshot) {
    const type = document.querySelector<HTMLElement>("#mod_sysinfo > div:nth-child(3) > h2");
    if (type) type.innerHTML = window._escapeHtml(snapshot.os);
  }

  private updateUptime(snapshot: SysinfoSnapshot) {
    const uptime = {
      raw: Math.floor(snapshot.uptime),
      days: 0,
      hours: 0 as number | string,
      minutes: 0 as number | string,
    };

    uptime.days = Math.floor(uptime.raw / 86400);
    uptime.raw -= uptime.days * 86400;
    uptime.hours = Math.floor(uptime.raw / 3600);
    uptime.raw -= uptime.hours * 3600;
    uptime.minutes = Math.floor(uptime.raw / 60);

    if (uptime.hours.toString().length !== 2) uptime.hours = `0${uptime.hours}`;
    if (uptime.minutes.toString().length !== 2) uptime.minutes = `0${uptime.minutes}`;

    const indicator = document.querySelector<HTMLElement>("#mod_sysinfo > div:nth-child(2) > h2");
    if (indicator) {
      indicator.innerHTML = `${uptime.days}<span style="opacity:0.5;">d</span>${uptime.hours}<span style="opacity:0.5;">:</span>${uptime.minutes}`;
    }
  }

  private renderBattery(snapshot: SysinfoSnapshot) {
    const indicator = document.querySelector<HTMLElement>("#mod_sysinfo > div:last-child > h2");
    if (!indicator) return;

    const battery = snapshot.battery;
    if (battery.hasBattery) {
      if (battery.isCharging) {
        indicator.innerHTML = "CHARGE";
      } else if (battery.acConnected) {
        indicator.innerHTML = "WIRED";
      } else {
        indicator.innerHTML = `${battery.percent ?? 0}%`;
      }
    } else {
      indicator.innerHTML = "ON";
    }
  }

  destroy() {
    window.clearInterval(this.updater);
    window.clearInterval(this.batteryUpdater);
  }
}

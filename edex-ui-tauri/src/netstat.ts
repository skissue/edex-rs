import { getExternalIpInfo, getNetworkStatus, type GeoLocation, type NetworkStatus } from "./backend";

export class Netstat {
  parent: HTMLElement;
  offline = false;
  iface: string | null = null;
  internalIPv4: string | null = null;
  ipinfo: { ip: string; geo: GeoLocation | null } | null = null;
  geoLookup = { get: () => null };
  private currentlyUpdating = false;
  private externalInfoUpdating = false;
  private runsBeforeGeoIPUpdate = 0;
  private infoUpdater: number;

  constructor(parentId: string) {
    if (!parentId) throw new Error("Missing parameters");

    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Missing netstat parent: ${parentId}`);
    this.parent = parent;

    const element = document.createElement("div");
    element.setAttribute("id", "mod_netstat");
    element.setAttribute("style", "animation-play-state: running;");
    element.innerHTML = `<div id="mod_netstat_inner">
                <h1>NETWORK STATUS<i id="mod_netstat_iname"></i></h1>
                <div id="mod_netstat_innercontainer">
                    <div>
                        <h1>STATE</h1>
                        <h2>UNKNOWN</h2>
                    </div>
                    <div>
                        <h1>IPv4</h1>
                        <h2>--.--.--.--</h2>
                    </div>
                    <div>
                        <h1>PING</h1>
                        <h2>--ms</h2>
                    </div>
                </div>
            </div>`;
    this.parent.insertBefore(element, this.parent.querySelector("#mod_globe"));

    void this.updateInfo();
    this.infoUpdater = window.setInterval(() => {
      void this.updateInfo();
    }, 2000);
  }

  async updateInfo() {
    if (this.currentlyUpdating) return;
    this.currentlyUpdating = true;

    try {
      const status = await getNetworkStatus(this.settingAsString("iface"), this.settingAsString("pingAddr") || "1.1.1.1");
      this.applyStatus(status);
    } catch (error) {
      console.error("Failed to update network status", error);
      this.setOffline();
    } finally {
      this.currentlyUpdating = false;
    }
  }

  private applyStatus(status: NetworkStatus) {
    if (!status.iface || !status.ip4) {
      this.iface = null;
      this.setOffline();
      return;
    }

    this.iface = status.iface;
    const fallbackIp = status.displayIp4 || status.ip4;
    if (status.ip4 !== this.internalIPv4) {
      this.runsBeforeGeoIPUpdate = 0;
      this.ipinfo = { ip: fallbackIp, geo: null };
    } else if (!this.ipinfo) {
      this.ipinfo = { ip: fallbackIp, geo: null };
    }
    this.internalIPv4 = status.ip4;
    this.setText("#mod_netstat_iname", `Interface: ${status.iface}`);

    if (!status.online || status.pingMs === null) {
      this.setOffline(fallbackIp);
      return;
    }

    this.offline = false;
    this.setText("#mod_netstat_innercontainer > div:first-child > h2", "ONLINE");
    this.setText("#mod_netstat_innercontainer > div:nth-child(2) > h2", this.ipinfo.ip);
    this.setText("#mod_netstat_innercontainer > div:nth-child(3) > h2", `${Math.round(status.pingMs)}ms`);

    if (this.runsBeforeGeoIPUpdate === 0) {
      void this.updateExternalInfo(fallbackIp);
    } else {
      this.runsBeforeGeoIPUpdate -= 1;
    }
  }

  private async updateExternalInfo(fallbackIp: string) {
    if (this.externalInfoUpdating) return;
    this.externalInfoUpdating = true;

    try {
      const external = await getExternalIpInfo();
      this.ipinfo = { ip: external.ip, geo: external.geo };
      this.setText("#mod_netstat_innercontainer > div:nth-child(2) > h2", external.ip);
      this.runsBeforeGeoIPUpdate = 10;
    } catch (error) {
      console.warn("Failed to update external IP info", error);
      if (!this.ipinfo) this.ipinfo = { ip: fallbackIp, geo: null };
      this.runsBeforeGeoIPUpdate = 3;
    } finally {
      this.externalInfoUpdating = false;
    }
  }

  private setOffline(ip4 = "--.--.--.--") {
    this.offline = true;
    if (this.iface === null) this.setText("#mod_netstat_iname", "Interface: (offline)");
    this.setText("#mod_netstat_innercontainer > div:first-child > h2", "OFFLINE");
    this.setText("#mod_netstat_innercontainer > div:nth-child(2) > h2", ip4);
    this.setText("#mod_netstat_innercontainer > div:nth-child(3) > h2", "--ms");
  }

  private setText(selector: string, text: string) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) element.innerText = text;
  }

  private settingAsString(key: string) {
    const value = window.settings[key];
    return typeof value === "string" ? value : "";
  }

  destroy() {
    window.clearInterval(this.infoUpdater);
  }
}

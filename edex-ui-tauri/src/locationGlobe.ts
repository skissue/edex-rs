import { getNetworkConnections, lookupIpGeo, type GeoLocation } from "./backend";
import gridData from "./assets/misc/grid.json";
import "./assets/vendor/encom-globe.js";

type EncomPin = {
  remove: () => void;
};

type EncomMarker = {
  remove: () => void;
};

type EncomGlobe = {
  domElement: HTMLCanvasElement;
  camera: {
    aspect: number;
    updateProjectionMatrix: () => void;
  };
  renderer: {
    setSize: (width: number, height: number) => void;
  };
  pins: EncomPin[];
  markers: EncomMarker[];
  init: (fogColor: string, callback: () => void) => void;
  tick: () => void;
  destroy: (callback?: () => void) => void;
  addPin: (lat: number, lon: number, text: string, altitude?: number) => EncomPin;
  addMarker: (lat: number, lon: number, text: string, connected?: boolean, altitude?: number) => EncomMarker;
  addConstellation: (satellites: Array<{ lat: number; lon: number; altitude: number }>) => unknown;
};

type EncomNamespace = {
  Globe: new (
    width: number,
    height: number,
    options: Record<string, unknown>,
  ) => EncomGlobe;
};

type NetstatLike = {
  offline: boolean;
  ipinfo?: {
    geo: {
      latitude?: number;
      longitude?: number;
    } | null;
  } | null;
};

declare global {
  interface Window {
    ENCOM?: EncomNamespace;
  }
}

const geodata = gridData as { tiles: unknown[] };

export class LocationGlobe {
  parent: HTMLElement;
  globe: EncomGlobe | null = null;
  conns: Array<{ ip: string; pin: EncomPin }> = [];
  lastgeo: { latitude: number; longitude: number } = { latitude: 0, longitude: 0 };
  private element: HTMLElement;
  private animateFrame: number | null = null;
  private animateTimer: number | null = null;
  private locUpdater: number | null = null;
  private connsUpdater: number | null = null;
  private resizeHandler: (() => void) | null = null;
  private geoCache = new Map<string, GeoLocation | null>();
  private geoLookups = new Set<string>();

  constructor(parentId: string) {
    if (!parentId) throw new Error("Missing parameters");

    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Missing globe parent: ${parentId}`);
    this.parent = parent;

    document.getElementById("mod_globe")?.remove();
    this.element = document.createElement("div");
    this.element.setAttribute("id", "mod_globe");
    this.element.setAttribute("style", "animation-play-state: running;");
    this.element.innerHTML = `<div id="mod_globe_innercontainer">
                <h1>WORLD VIEW<i>GLOBAL NETWORK MAP</i></h1>
                <h2>ENDPOINT LAT/LON<i class="mod_globe_headerInfo">0.0000, 0.0000</i></h2>
                <div id="mod_globe_canvas_placeholder"></div>
                <h3>OFFLINE</h3>
            </div>`;
    this.parent.append(this.element);

    window.setTimeout(() => this.initGlobe(), 2000);
    window.setTimeout(() => {
      this.updateLoc();
      this.locUpdater = window.setInterval(() => this.updateLoc(), 1000);
      void this.updateConns();
      this.connsUpdater = window.setInterval(() => {
        void this.updateConns();
      }, 3000);
    }, 4000);
  }

  private initGlobe() {
    const ENCOM = window.ENCOM;
    const container = document.getElementById("mod_globe_innercontainer");
    const placeholder = document.getElementById("mod_globe_canvas_placeholder");
    if (!ENCOM || !container || !placeholder) return;

    const width = Math.max(placeholder.offsetWidth, 1);
    const height = Math.max(placeholder.offsetHeight, width, 1);
    const globeTheme = window.theme?.globe as
      | { base?: string; marker?: string; pin?: string; satellite?: string }
      | undefined;
    const color = `rgb(${window.theme?.r ?? 170},${window.theme?.g ?? 207},${window.theme?.b ?? 209})`;

    try {
      this.globe = new ENCOM.Globe(width, height, {
        font: window.theme?.cssvars.font_main,
        data: [],
        tiles: geodata.tiles,
        baseColor: globeTheme?.base || color,
        markerColor: globeTheme?.marker || color,
        pinColor: globeTheme?.pin || color,
        satelliteColor: globeTheme?.satellite || color,
        scale: 1.1,
        viewAngle: 0.63,
        dayLength: 1000 * 45,
        introLinesDuration: 2000,
        introLinesColor: globeTheme?.marker || color,
        maxPins: 300,
        maxMarkers: 100,
      });

      placeholder.remove();
      container.append(this.globe.domElement);
      this.globe.init(String(window.theme?.colors.light_black || "#000000"), () => {
        this.animate();
      });

      this.resizeHandler = () => this.resize();
      window.addEventListener("resize", this.resizeHandler);
      this.addConstellation();
    } catch (error) {
      console.error("Failed to initialize location globe", error);
      this.setHeaderInfo("UNKNOWN");
      this.element.setAttribute("class", "offline");
    }
  }

  private animate() {
    if (!this.globe) return;
    this.globe.tick();
    this.animateTimer = window.setTimeout(() => {
      this.animateFrame = window.requestAnimationFrame(() => this.animate());
    }, 1000 / 30);
  }

  private resize() {
    const canvas = document.querySelector<HTMLCanvasElement>("div#mod_globe canvas");
    if (!canvas || !this.globe) return;
    this.globe.camera.aspect = canvas.offsetWidth / canvas.offsetHeight;
    this.globe.camera.updateProjectionMatrix();
    this.globe.renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
  }

  private addConstellation() {
    if (!this.globe) return;
    const constellation = [];
    for (let i = 0; i < 2; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        constellation.push({
          lat: 50 * i - 30 + 15 * Math.random(),
          lon: 120 * j - 120 + 30 * i,
          altitude: Math.random() * (1.7 - 1.3) + 1.3,
        });
      }
    }
    this.globe.addConstellation(constellation);
  }

  addRandomConnectedMarkers() {
    if (!this.globe) return;
    const randomLat = this.getRandomInRange(40, 90, 3);
    const randomLong = this.getRandomInRange(-180, 0, 3);
    this.globe.addMarker(randomLat, randomLong, "");
    this.globe.addMarker(randomLat - 20, randomLong + 150, "", true);
  }

  addTemporaryConnectedMarker(_ip: string) {
    this.addRandomConnectedMarkers();
  }

  async addConn(ip: string) {
    if (!this.globe || this.conns.some((conn) => conn.ip === ip) || this.geoLookups.has(ip)) return;

    let geo = this.geoCache.get(ip);
    if (typeof geo === "undefined") {
      this.geoLookups.add(ip);
      try {
        geo = await lookupIpGeo(ip);
        this.geoCache.set(ip, geo);
      } catch (error) {
        console.warn(`Failed to locate connection peer ${ip}`, error);
        geo = null;
        this.geoCache.set(ip, null);
      } finally {
        this.geoLookups.delete(ip);
      }
    }

    if (typeof geo?.latitude === "number" && typeof geo.longitude === "number" && this.globe) {
      if (geo.latitude < -90 || geo.latitude > 90 || geo.longitude < -180 || geo.longitude > 180) return;
      try {
        this.conns.push({
          ip,
          pin: this.globe.addPin(geo.latitude, geo.longitude, "", 1.2),
        });
      } catch (error) {
        console.warn(`Failed to add connection pin for ${ip}`, error);
        this.geoCache.set(ip, null);
      }
    }
  }

  removeConn(ip: string) {
    const index = this.conns.findIndex((conn) => conn.ip === ip);
    if (index === -1) return;
    this.conns[index].pin.remove();
    this.conns.splice(index, 1);
  }

  removeMarkers() {
    if (!this.globe) return;
    this.globe.markers.forEach((marker) => marker.remove());
    this.globe.markers = [];
  }

  removePins() {
    if (!this.globe) return;
    this.globe.pins.forEach((pin) => pin.remove());
    this.globe.pins = [];
  }

  getRandomInRange(from: number, to: number, fixed: number) {
    return Number((Math.random() * (to - from) + from).toFixed(fixed));
  }

  updateLoc() {
    const netstat = window.mods.netstat as NetstatLike | undefined;
    if (!netstat || netstat.offline) {
      this.element.setAttribute("class", "offline");
      this.setHeaderInfo("(OFFLINE)");
      this.removePins();
      this.removeMarkers();
      this.conns = [];
      this.lastgeo = { latitude: 0, longitude: 0 };
      return;
    }

    this.updateConOnlineConnection();
  }

  updateConOnlineConnection() {
    const netstat = window.mods.netstat as NetstatLike | undefined;
    const geo = netstat?.ipinfo?.geo;
    if (typeof geo?.latitude !== "number" || typeof geo.longitude !== "number") {
      this.element.setAttribute("class", "");
      this.setHeaderInfo("UNKNOWN");
      return;
    }

    const newgeo = {
      latitude: Math.round(geo.latitude * 10000) / 10000,
      longitude: Math.round(geo.longitude * 10000) / 10000,
    };

    if (newgeo.latitude !== this.lastgeo.latitude || newgeo.longitude !== this.lastgeo.longitude) {
      this.setHeaderInfo(`${newgeo.latitude}, ${newgeo.longitude}`);
      this.removePins();
      this.removeMarkers();
      this.conns = [];
      this.globe?.addPin(newgeo.latitude, newgeo.longitude, "", 1.2);
      this.globe?.addMarker(newgeo.latitude, newgeo.longitude, "", false, 1.2);
    }

    this.lastgeo = newgeo;
    this.element.setAttribute("class", "");
  }

  async updateConns() {
    const netstat = window.mods.netstat as NetstatLike | undefined;
    if (!this.globe || netstat?.offline !== false) return false;

    try {
      const connections = await getNetworkConnections();
      const newconns = Array.from(
        new Set(
          connections
            .filter((conn) => conn.state === "ESTABLISHED")
            .map((conn) => conn.peerAddress),
        ),
      );

      this.conns.forEach((conn) => {
        if (!newconns.includes(conn.ip)) this.removeConn(conn.ip);
      });

      newconns
        .filter((ip) => !this.conns.some((conn) => conn.ip === ip))
        .slice(0, 5)
        .forEach((ip) => {
          void this.addConn(ip);
        });
    } catch (error) {
      console.warn("Failed to update network connection pins", error);
    }

    return true;
  }

  private setHeaderInfo(text: string) {
    const element = document.querySelector<HTMLElement>("i.mod_globe_headerInfo");
    if (element) element.innerText = text;
  }

  destroy() {
    if (this.locUpdater !== null) window.clearInterval(this.locUpdater);
    if (this.connsUpdater !== null) window.clearInterval(this.connsUpdater);
    if (this.animateTimer !== null) window.clearTimeout(this.animateTimer);
    if (this.animateFrame !== null) window.cancelAnimationFrame(this.animateFrame);
    if (this.resizeHandler) window.removeEventListener("resize", this.resizeHandler);
    this.globe?.destroy();
  }
}

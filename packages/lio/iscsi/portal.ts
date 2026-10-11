/**
 * iscsi/<iqn>/tpgt_N/np/<ip>:<port>/     (IPv6 as [addr]:port)
 */

import { ConfigManager, ConfigNode } from "@/lib/base";
import { LIOError } from "@/lib/configfs";
import type { ConfigFS } from "@/lib/configfs";

interface PortalAddress {
  ip?: string;
  port?: number;
}

interface PortalCreateOptions extends PortalAddress {
  /** Enable iSER (RDMA) on this portal. */
  iser?: boolean;
  /** Enable Chelsio cxgbit offload on this portal. */
  offload?: boolean;
}

class Portal extends ConfigNode {
  readonly ip: string;
  readonly port: number;

  constructor(fs: ConfigFS, tpgPath: string, ip: string, port: number) {
    super(fs, fs.join(tpgPath, "np", Portal.format(ip, port)));
    this.ip = ip;
    this.port = port;
  }

  get name(): string {
    return Portal.format(this.ip, this.port);
  }

  static format(ip: string, port: number): string {
    return ip.includes(":") ? `[${ip}]:${port}` : `${ip}:${port}`;
  }

  /** iSER enabled? False when the kernel has no iSER support. */
  async iser(): Promise<boolean> {
    return (await this.fs.readOptional(this.child("iser"))) === "1";
  }

  async setIser(enabled: boolean): Promise<void> {
    await this.fs.write(this.child("iser"), enabled ? "1" : "0");
  }

  /** Chelsio cxgbit offload enabled? False when the kernel has no such support. */
  async offload(): Promise<boolean> {
    return (await this.fs.readOptional(this.child("cxgbit"))) === "1";
  }

  async setOffload(enabled: boolean): Promise<void> {
    await this.fs.write(this.child("cxgbit"), enabled ? "1" : "0");
  }
}

class PortalManager extends ConfigManager<Portal> {
  private readonly tpgPath: string;

  constructor(fs: ConfigFS, tpgPath: string) {
    super(fs, fs.join(tpgPath, "np"));
    this.tpgPath = tpgPath;
  }

  async list(): Promise<Portal[]> {
    const result: Portal[] = [];
    for (const name of await this.childDirs()) {
      const m = /^\[(.+)\]:(\d+)$/.exec(name) ?? /^(.+):(\d+)$/.exec(name);
      if (m) result.push(this.open(m[1]!, Number(m[2])));
    }
    return result;
  }

  async get({
    ip = "0.0.0.0",
    port = 3260,
  }: PortalAddress = {}): Promise<Portal | null> {
    return (await this.hasChild(Portal.format(ip, port)))
      ? this.open(ip, port)
      : null;
  }

  async create({
    ip = "0.0.0.0",
    port = 3260,
    iser,
    offload,
  }: PortalCreateOptions = {}): Promise<Portal> {
    await this.makeChild(Portal.format(ip, port));
    const portal = this.open(ip, port);
    try {
      if (iser) await portal.setIser(true);
      if (offload) await portal.setOffload(true);
    } catch (e) {
      await this.removeChild(portal.name).catch(() => {});
      throw e;
    }
    return portal;
  }

  async delete(target: PortalAddress | Portal = {}): Promise<void> {
    const portal = target instanceof Portal ? target : await this.get(target);
    if (!portal) throw new LIOError("Portal not found", { code: "ENOENT" });
    await this.removeChild(portal.name);
  }

  async deleteAll(): Promise<void> {
    for (const p of await this.list()) await this.delete(p);
  }

  private open(ip: string, port: number): Portal {
    return new Portal(this.fs, this.tpgPath, ip, port);
  }
}

export { Portal, PortalManager };

export type { PortalAddress, PortalCreateOptions };

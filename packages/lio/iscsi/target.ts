/**
 * iscsi/
 *   iSCSIManager
 *   ├─ discoveryAuth : DiscoveryAuthController  (model: DiscoveryAuth)
 *   ├─ session       : SessionManager           (every session of every target)
 *   └─ iSCSI  (<iqn>/)
 *        ├─ tpg     : TPGManager
 *        └─ session : SessionManager
 */

import { ConfigManager, ConfigNode } from "@/lib/base";
import { LIOError } from "@/lib/configfs";
import type { ConfigFS } from "@/lib/configfs";
import { DiscoveryAuthController } from "@/iscsi/auth";
import type { ACL } from "@/iscsi/acl";
import { SessionManager } from "@/iscsi/session";
import { TPGManager } from "@/iscsi/tpg";
import { WWN_RE, defaultIqn, normalizeWwn } from "@/lib/wwn";

const ISCSI_HINT =
  "iSCSI fabric not available. Load it first: modprobe iscsi_target_mod";

class iSCSI extends ConfigNode {
  readonly wwn: string;
  readonly tpg: TPGManager;
  readonly session: SessionManager;

  constructor(fs: ConfigFS, wwn: string) {
    super(fs, fs.resolve("iscsi", wwn));
    this.wwn = wwn;
    this.tpg = new TPGManager(fs, this.path, wwn);
    this.session = new SessionManager(fs, this.path, () => this.acls());
  }

  /** ACLs of every TPG of this target. */
  async acls(): Promise<ACL[]> {
    const perTpg = await Promise.all(
      (await this.tpg.list()).map((tpg) => tpg.acl.list()),
    );
    return perTpg.flat();
  }
}

class iSCSIManager extends ConfigManager<iSCSI> {
  readonly discoveryAuth: DiscoveryAuthController;
  readonly session: SessionManager;

  constructor(fs: ConfigFS) {
    super(fs, fs.resolve("iscsi"));
    this.discoveryAuth = new DiscoveryAuthController(
      fs,
      this.child("discovery_auth"),
    );
    this.session = new SessionManager(fs, this.path, async () => {
      const perTarget = await Promise.all(
        (await this.list()).map((t) => t.acls()),
      );
      return perTarget.flat();
    });
  }

  /** False when the iSCSI fabric module is not loaded. */
  isAvailable(): Promise<boolean> {
    return this.exists();
  }

  async list(): Promise<iSCSI[]> {
    await this.fs.assertExists(this.path, ISCSI_HINT);
    return (await this.childDirs(WWN_RE)).map((w) => this.open(w));
  }

  async get({ wwn }: { wwn: string }): Promise<iSCSI | null> {
    await this.fs.assertExists(this.path, ISCSI_HINT);
    const w = normalizeWwn(wwn);
    return (await this.hasChild(w)) ? this.open(w) : null;
  }

  async create({ wwn }: { wwn?: string } = {}): Promise<iSCSI> {
    await this.fs.assertExists(this.path, ISCSI_HINT);
    const w = wwn ? normalizeWwn(wwn) : defaultIqn();
    await this.makeChild(w);
    return this.open(w);
  }

  /** Removes the target together with all its TPGs, LUNs, ACLs and portals. */
  async delete(target: string | iSCSI): Promise<void> {
    const t =
      typeof target === "string" ? await this.get({ wwn: target }) : target;
    if (!t)
      throw new LIOError(`iSCSI target not found: ${String(target)}`, {
        code: "ENOENT",
      });
    await t.tpg.deleteAll();
    await this.removeChild(t.wwn);
  }

  async deleteAll(): Promise<void> {
    for (const t of await this.list()) await this.delete(t);
  }

  private open(wwn: string): iSCSI {
    return new iSCSI(this.fs, wwn);
  }
}

export { iSCSI, iSCSIManager };

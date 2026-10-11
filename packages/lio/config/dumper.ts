/**
 * Reads the live kernel configuration into a SavedConfig.
 *
 *   ConfigDumper
 *   ├─ fabricModules()   discovery authentication
 *   ├─ storageObjects()  every backstore (StorageObject.dump())
 *   └─ targets()         iSCSI targets -> TPGs -> LUNs / ACLs / portals
 */

import type { Backstores } from "@/core/backstore";
import { PLUGIN_KIND, storageObjectRef } from "@/core/backstore";
import type { ACL } from "@/iscsi/acl";
import type { Portal } from "@/iscsi/portal";
import type { LUN } from "@/iscsi/lun";
import type { iSCSI, iSCSIManager } from "@/iscsi/target";
import type { TPG } from "@/iscsi/tpg";
import { CHAP_KEYS, DISCOVERY_CHAP_KEYS, chapToSaved } from "@/config/chap";
import type {
  SavedAcl,
  SavedAttrs,
  SavedConfig,
  SavedFabricModule,
  SavedLun,
  SavedMappedLun,
  SavedPortal,
  SavedStorageObject,
  SavedTarget,
  SavedTpg,
} from "@/config/types";

interface ConfigDeps {
  backstores: Backstores;
  iscsi: iSCSIManager;
}

class ConfigDumper {
  private readonly backstores: Backstores;
  private readonly iscsi: iSCSIManager;

  constructor({ backstores, iscsi }: ConfigDeps) {
    this.backstores = backstores;
    this.iscsi = iscsi;
  }

  async dump(): Promise<SavedConfig> {
    return {
      fabric_modules: await this.fabricModules(),
      storage_objects: await this.storageObjects(),
      targets: await this.targets(),
    };
  }

  /** Only emitted when discovery authentication is in use. */
  async fabricModules(): Promise<SavedFabricModule[]> {
    if (!(await this.iscsi.isAvailable())) return [];
    const auth = this.iscsi.discoveryAuth;
    const credentials = chapToSaved(
      await auth.dump({ skipEmpty: true }),
      DISCOVERY_CHAP_KEYS,
    );
    const enforce =
      (await auth.getRaw("enforce_discovery_auth").catch(() => "0")) === "1";
    if (!enforce && Object.keys(credentials).length === 0) return [];
    return [
      { name: "iscsi", discovery_enable_auth: enforce ? 1 : 0, ...credentials },
    ];
  }

  async storageObjects(): Promise<SavedStorageObject[]> {
    if (!(await this.backstores.isAvailable())) return [];
    const out: SavedStorageObject[] = [];
    for (const so of await this.backstores.list()) out.push(await so.dump());
    return out;
  }

  async targets(): Promise<SavedTarget[]> {
    if (!(await this.iscsi.isAvailable())) return [];
    const out: SavedTarget[] = [];
    for (const target of await this.iscsi.list())
      out.push(await this.target(target));
    return out;
  }

  private async target(target: iSCSI): Promise<SavedTarget> {
    const tpgs: SavedTpg[] = [];
    for (const tpg of await target.tpg.list()) tpgs.push(await this.tpg(tpg));
    return { fabric: "iscsi", wwn: target.wwn, tpgs };
  }

  private async tpg(tpg: TPG): Promise<SavedTpg> {
    const luns: SavedLun[] = [];
    for (const lun of await tpg.lun.list()) {
      const saved = await this.lun(lun);
      if (saved) luns.push(saved);
    }
    const acls: SavedAcl[] = [];
    for (const acl of await tpg.acl.list()) acls.push(await this.acl(acl));
    const portals: SavedPortal[] = [];
    for (const portal of await tpg.portal.list())
      portals.push(await this.portal(portal));

    return {
      tag: tpg.tag,
      enable: await tpg.isEnabled(),
      attributes: (await tpg.attrib.dump({ numeric: true })) as SavedAttrs,
      parameters: (await tpg.param.dump({ skipEmpty: true })) as SavedAttrs,
      luns,
      node_acls: acls,
      portals,
      ...chapToSaved(await tpg.auth.dump({ skipEmpty: true }), CHAP_KEYS),
    };
  }

  /** A LUN whose symlink is missing or points outside core/ is not saved. */
  private async lun(lun: LUN): Promise<SavedLun | null> {
    const backstore = await lun.backstore();
    const kind = backstore ? PLUGIN_KIND[backstore.plugin] : undefined;
    if (!backstore || !kind) return null;

    const saved: SavedLun = {
      index: lun.index,
      storage_object: storageObjectRef(kind, backstore.name),
    };
    const alias = await lun.alias();
    if (alias) saved.alias = alias;
    const group = await lun.aluaGroup();
    if (group) saved.alua_tg_pt_gp_name = group;
    return saved;
  }

  private async acl(acl: ACL): Promise<SavedAcl> {
    const mapped: SavedMappedLun[] = [];
    for (const m of await acl.mappedLun.list()) {
      const tpgLun = await m.lun();
      if (tpgLun === null) continue;
      mapped.push({
        index: m.index,
        tpg_lun: tpgLun,
        write_protect: await m.attrib.get("write_protect"),
      });
    }

    const saved: SavedAcl = {
      node_wwn: acl.wwn,
      attributes: (await acl.attrib.dump({ numeric: true })) as SavedAttrs,
      mapped_luns: mapped,
      ...chapToSaved(await acl.auth.dump({ skipEmpty: true }), CHAP_KEYS),
    };
    const tag = await acl.tag();
    if (tag) saved.tag = tag;
    saved.tcq_depth = await acl.cmdsnDepth().catch(() => undefined);
    if (saved.tcq_depth === undefined || Number.isNaN(saved.tcq_depth))
      delete saved.tcq_depth;
    return saved;
  }

  private async portal(portal: Portal): Promise<SavedPortal> {
    return {
      ip_address: portal.ip,
      port: portal.port,
      iser: await portal.iser(),
      offload: await portal.offload(),
    };
  }
}

export type { ConfigDeps };
export { ConfigDumper };

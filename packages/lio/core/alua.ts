/**
 * core/<plugin>_<hba>/<name>/alua/<group>/
 *
 *   StorageObject
 *   └─ alua : ALUATargetPortGroupManager
 *        ALUATargetPortGroup   (default_tg_pt_gp, plus user-created groups)
 *        └─ attrib : ALUATargetPortGroupAttribController (model: ALUATargetPortGroupAttrib)
 *
 * The attribute files live directly in the group directory.
 */

import {
  AttributeController,
  ConfigManager,
  ConfigNode,
  assertIdent,
  attr,
} from "@/lib/base";
import type { AttrSchema, Codec } from "@/lib/base";
import { LIOError } from "@/lib/configfs";
import type { ConfigFS } from "@/lib/configfs";
import type { SavedAluaGroup } from "@/config/types";

const DEFAULT_ALUA_GROUP = "default_tg_pt_gp";

/** The kernel prints "NO ID" until an id has been assigned. */
const groupIdCodec: Codec<number> = {
  decode: (raw) => {
    const n = Number(raw);
    return raw !== "" && Number.isInteger(n) ? n : -1;
  },
  encode: (v) => {
    if (!Number.isInteger(v) || v < 0 || v > 65535)
      throw new LIOError(`Invalid ALUA group id ${v}`);
    return String(v);
  },
};

interface ALUATargetPortGroupAttrib {
  alua_access_state: number;
  /** Informational text/number maintained by the kernel. */
  alua_access_status: string;
  alua_access_type: number;
  alua_support_active_nonoptimized: boolean;
  alua_support_active_optimized: boolean;
  alua_support_lba_dependent: boolean;
  alua_support_offline: boolean;
  alua_support_standby: boolean;
  alua_support_transitioning: boolean;
  alua_support_unavailable: boolean;
  alua_write_metadata: boolean;
  implicit_trans_secs: number;
  /** Storage objects that belong to the group. */
  members: string;
  nonop_delay_msecs: number;
  preferred: boolean;
  /** -1 while the group has no id yet. */
  tg_pt_gp_id: number;
  trans_delay_msecs: number;
}

const ALUA_TPG_ATTRIB: AttrSchema<ALUATargetPortGroupAttrib> = {
  alua_access_state: attr.int(),
  alua_access_status: attr.str({ readOnly: true }),
  alua_access_type: attr.int(),
  alua_support_active_nonoptimized: attr.bool(),
  alua_support_active_optimized: attr.bool(),
  alua_support_lba_dependent: attr.bool(),
  alua_support_offline: attr.bool(),
  alua_support_standby: attr.bool(),
  alua_support_transitioning: attr.bool(),
  alua_support_unavailable: attr.bool(),
  alua_write_metadata: attr.bool(),
  implicit_trans_secs: attr.int(),
  members: attr.str({ readOnly: true }),
  nonop_delay_msecs: attr.int(),
  preferred: attr.bool(),
  tg_pt_gp_id: attr.custom(groupIdCodec),
  trans_delay_msecs: attr.int(),
};

class ALUATargetPortGroupAttribController extends AttributeController<ALUATargetPortGroupAttrib> {
  protected readonly schema = ALUA_TPG_ATTRIB;
}

class ALUATargetPortGroup extends ConfigNode {
  readonly name: string;
  readonly attrib: ALUATargetPortGroupAttribController;

  constructor(fs: ConfigFS, alua_path: string, name: string) {
    super(fs, fs.join(alua_path, name));
    this.name = name;
    this.attrib = new ALUATargetPortGroupAttribController(fs, this.path);
  }

  get isDefault(): boolean {
    return this.name === DEFAULT_ALUA_GROUP;
  }

  /** Shortcut for attrib.get("tg_pt_gp_id"); -1 if none assigned yet. */
  id(): Promise<number> {
    return this.attrib.get("tg_pt_gp_id");
  }
}

interface ALUAGroupCreateOptions {
  /** Group id (1..65535). Default: the lowest free id. */
  id?: number;
}

class ALUATargetPortGroupManager extends ConfigManager<ALUATargetPortGroup> {
  async list(): Promise<ALUATargetPortGroup[]> {
    return (await this.childDirs()).map((n) => this.open(n));
  }

  async get(name: string): Promise<ALUATargetPortGroup | null> {
    return (await this.hasChild(name)) ? this.open(name) : null;
  }

  async create(
    name: string,
    options: ALUAGroupCreateOptions = {},
  ): Promise<ALUATargetPortGroup> {
    assertIdent(name, "ALUA group name");
    const id = options.id ?? (await this.freeId());
    await this.makeChild(name);
    const group = this.open(name);
    try {
      await group.attrib.set("tg_pt_gp_id", id);
    } catch (e) {
      await this.removeChild(name).catch(() => {});
      throw e;
    }
    return group;
  }

  /** The default group cannot be removed. */
  async delete(target: string | ALUATargetPortGroup): Promise<void> {
    const group = typeof target === "string" ? await this.get(target) : target;
    if (!group)
      throw new LIOError(`ALUA group not found: ${String(target)}`, {
        code: "ENOENT",
      });
    if (group.isDefault)
      throw new LIOError(
        `The default ALUA group "${group.name}" cannot be deleted`,
        {
          code: "EPERM",
        },
      );
    await this.removeChild(group.name);
  }

  /** Removes every group except the default one. */
  async deleteCustom(): Promise<void> {
    for (const group of await this.list()) {
      if (!group.isDefault) await this.delete(group);
    }
  }

  /** Saved form of every group: `name` plus the writable attribute files. */
  async dump(): Promise<SavedAluaGroup[]> {
    const out: SavedAluaGroup[] = [];
    for (const group of await this.list()) {
      const attributes = await group.attrib.dump({ numeric: true });
      // "NO ID" cannot be restored, drop it.
      if (typeof attributes["tg_pt_gp_id"] !== "number")
        delete attributes["tg_pt_gp_id"];
      out.push({ name: group.name, ...attributes });
    }
    return out;
  }

  private async freeId(): Promise<number> {
    const used = new Set<number>();
    for (const group of await this.list()) {
      const id = await group.id().catch(() => -1);
      if (id >= 0) used.add(id);
    }
    for (let id = 1; id <= 65535; id++) if (!used.has(id)) return id;
    throw new LIOError("No free ALUA group id");
  }

  private open(name: string): ALUATargetPortGroup {
    return new ALUATargetPortGroup(this.fs, this.path, name);
  }
}

export type { ALUATargetPortGroupAttrib, ALUAGroupCreateOptions };
export {
  DEFAULT_ALUA_GROUP,
  groupIdCodec,
  ALUA_TPG_ATTRIB,
  ALUATargetPortGroupAttribController,
  ALUATargetPortGroup,
  ALUATargetPortGroupManager,
};

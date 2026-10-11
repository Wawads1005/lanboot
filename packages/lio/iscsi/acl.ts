/**
 * iscsi/<iqn>/tpgt_N/acls/<initiator>/
 *   ACL
 *   ├─ attrib    : ACLAttribController        (model: ACLAttrib)
 *   ├─ auth      : ACLAuthController          (model: ACLAuth)
 *   ├─ mappedLun : MappedLunManager
 *   │    MappedLun  (lun_M/)
 *   │    └─ attrib : MappedLunAttribController (model: MappedLunAttrib)
 *   └─ session() : Session | null             (from the `info` file)
 */

import {
  AttributeController,
  ConfigManager,
  ConfigNode,
  attr,
  type AttrSchema,
} from "@/lib/base";
import { LIOError } from "@/lib/configfs";
import type { ConfigFS } from "@/lib/configfs";
import { ACLAuthController } from "@/iscsi/auth";
import type { LUN } from "@/iscsi/lun";
import { Session } from "@/iscsi/session";
import { normalizeWwn } from "@/lib/wwn";

/* -------------------------------------------------------------------------- */
/* ACL attrib/                                                                */
/* -------------------------------------------------------------------------- */

interface ACLAttrib {
  dataout_timeout: number;
  dataout_timeout_retries: number;
  default_erl: number;
  nopin_response_timeout: number;
  nopin_timeout: number;
  random_datain_pdu_offsets: boolean;
  random_datain_seq_offsets: boolean;
  random_r2t_offsets: boolean;
}

const ACL_ATTRIB: AttrSchema<ACLAttrib> = {
  dataout_timeout: attr.int(),
  dataout_timeout_retries: attr.int(),
  default_erl: attr.int(),
  nopin_response_timeout: attr.int(),
  nopin_timeout: attr.int(),
  random_datain_pdu_offsets: attr.bool(),
  random_datain_seq_offsets: attr.bool(),
  random_r2t_offsets: attr.bool(),
};

class ACLAttribController extends AttributeController<ACLAttrib> {
  protected readonly schema = ACL_ATTRIB;
}

/* -------------------------------------------------------------------------- */
/* MappedLun                                                                  */
/* -------------------------------------------------------------------------- */

/** The attribute lives directly in the lun_M/ directory. */
interface MappedLunAttrib {
  write_protect: boolean;
}

const MAPPED_LUN_ATTRIB: AttrSchema<MappedLunAttrib> = {
  write_protect: attr.bool(),
};

class MappedLunAttribController extends AttributeController<MappedLunAttrib> {
  protected readonly schema = MAPPED_LUN_ATTRIB;
}

class MappedLun extends ConfigNode {
  readonly index: number;
  readonly attrib: MappedLunAttribController;

  constructor(fs: ConfigFS, aclPath: string, index: number) {
    super(fs, fs.join(aclPath, `lun_${index}`));
    this.index = index;
    this.attrib = new MappedLunAttribController(fs, this.path);
  }

  /** Index of the TPG LUN this entry points at. */
  async lun(): Promise<number | null> {
    for (const name of await this.fs.links(this.path)) {
      const m = /lun_(\d+)$/.exec(await this.fs.readlink(this.child(name)));
      if (m) return Number(m[1]);
    }
    return null;
  }

  async removeLink(): Promise<void> {
    for (const name of await this.fs.links(this.path))
      await this.fs.unlink(this.child(name));
  }
}

class MappedLunManager extends ConfigManager<MappedLun> {
  private readonly tpgPath: string;

  constructor(fs: ConfigFS, aclPath: string, tpgPath: string) {
    super(fs, aclPath);
    this.tpgPath = tpgPath;
  }

  async list(): Promise<MappedLun[]> {
    return (await this.childIndices("lun")).map((i) => this.open(i));
  }

  async get(index: number): Promise<MappedLun | null> {
    return (await this.hasChild(`lun_${index}`)) ? this.open(index) : null;
  }

  async create(
    index: number,
    lun: LUN | number,
    opts: { writeProtect?: boolean } = {},
  ): Promise<MappedLun> {
    const lunIndex = typeof lun === "number" ? lun : lun.index;
    const lunPath = this.fs.join(this.tpgPath, "lun", `lun_${lunIndex}`);
    if (!(await this.fs.exists(lunPath)))
      throw new LIOError(`LUN ${lunIndex} does not exist`, { code: "ENOENT" });

    await this.makeChild(`lun_${index}`);
    const mapped = this.open(index);
    try {
      await this.fs.symlink(
        lunPath,
        this.fs.join(mapped.path, `lun_${lunIndex}`),
      );
      if (opts.writeProtect !== undefined)
        await mapped.attrib.set("write_protect", opts.writeProtect);
    } catch (e) {
      await mapped.removeLink().catch(() => {});
      await this.removeChild(`lun_${index}`).catch(() => {});
      throw e;
    }
    return mapped;
  }

  async delete(target: number | MappedLun): Promise<void> {
    const mapped = typeof target === "number" ? await this.get(target) : target;
    if (!mapped)
      throw new LIOError(`Mapped LUN ${String(target)} not found`, {
        code: "ENOENT",
      });
    await mapped.removeLink();
    await this.removeChild(`lun_${mapped.index}`);
  }

  async deleteAll(): Promise<void> {
    for (const m of await this.list()) await this.delete(m);
  }

  private open(index: number): MappedLun {
    return new MappedLun(this.fs, this.path, index);
  }
}

/* -------------------------------------------------------------------------- */
/* ACL                                                                        */
/* -------------------------------------------------------------------------- */

class ACL extends ConfigNode {
  readonly tpgPath: string;
  /** Initiator IQN */
  readonly wwn: string;
  readonly attrib: ACLAttribController;
  readonly auth: ACLAuthController;
  readonly mappedLun: MappedLunManager;

  constructor(fs: ConfigFS, tpgPath: string, wwn: string) {
    super(fs, fs.join(tpgPath, "acls", wwn));
    this.tpgPath = tpgPath;
    this.wwn = wwn;
    this.attrib = new ACLAttribController(fs, this.child("attrib"));
    this.auth = new ACLAuthController(fs, this.child("auth"));
    this.mappedLun = new MappedLunManager(fs, this.path, tpgPath);
  }

  /** The initiator's active session, or null if it is not logged in. */
  session(): Promise<Session | null> {
    return Session.read(this.fs, this.path, this.tpgPath, this.wwn);
  }

  /** Free-form tag that can be set on an ACL ("" if none). */
  async tag(): Promise<string> {
    return (await this.fs.readOptional(this.child("tag"))) ?? "";
  }

  async setTag(tag: string): Promise<void> {
    await this.fs.write(this.child("tag"), tag);
  }

  /** Command window (queue depth) negotiated for this initiator. */
  async cmdsnDepth(): Promise<number> {
    return Number(await this.fs.read(this.child("cmdsn_depth")));
  }

  async setCmdsnDepth(depth: number): Promise<void> {
    if (!Number.isInteger(depth) || depth < 1)
      throw new LIOError(`Invalid cmdsn_depth ${depth}`);
    await this.fs.write(this.child("cmdsn_depth"), String(depth));
  }
}

class ACLManager extends ConfigManager<ACL> {
  private readonly tpgPath: string;

  constructor(fs: ConfigFS, tpgPath: string) {
    super(fs, fs.join(tpgPath, "acls"));
    this.tpgPath = tpgPath;
  }

  async list(): Promise<ACL[]> {
    return (await this.childDirs()).map((w) => this.open(w));
  }

  async get(wwn: string): Promise<ACL | null> {
    const w = normalizeWwn(wwn);
    return (await this.hasChild(w)) ? this.open(w) : null;
  }

  async create(wwn: string): Promise<ACL> {
    const w = normalizeWwn(wwn);
    await this.makeChild(w);
    return this.open(w);
  }

  async delete(target: string | ACL): Promise<void> {
    const acl = typeof target === "string" ? await this.get(target) : target;
    if (!acl)
      throw new LIOError(`ACL not found: ${String(target)}`, {
        code: "ENOENT",
      });
    await acl.mappedLun.deleteAll();
    await this.removeChild(acl.wwn);
  }

  async deleteAll(): Promise<void> {
    for (const acl of await this.list()) await this.delete(acl);
  }

  /** Remove every mapped LUN (in all ACLs) that points at TPG LUN `lunIndex`. */
  async unmapLun(lunIndex: number): Promise<void> {
    for (const acl of await this.list()) {
      for (const mapped of await acl.mappedLun.list()) {
        if ((await mapped.lun()) === lunIndex)
          await acl.mappedLun.delete(mapped);
      }
    }
  }

  private open(wwn: string): ACL {
    return new ACL(this.fs, this.tpgPath, wwn);
  }
}

export {
  ACL_ATTRIB,
  ACLAttribController,
  MAPPED_LUN_ATTRIB,
  MappedLunAttribController,
  MappedLun,
  MappedLunManager,
  ACL,
  ACLManager,
};

export type { ACLAttrib, MappedLunAttrib };

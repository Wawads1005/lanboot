/**
 * iscsi/<iqn>/tpgt_N/lun/lun_M/   -> symlink to core/<plugin>_<hba>/<name>
 */

import { ConfigManager, ConfigNode, assertIdent } from "@/lib/base";
import type { StorageObject } from "@/core/backstore";
import { DEFAULT_ALUA_GROUP } from "@/core/alua";
import { LIOError } from "@/lib/configfs";
import type { ConfigFS } from "@/lib/configfs";
import type { TPG } from "@/iscsi/tpg";

interface BackstoreRef {
  plugin: string;
  hbaIndex: number;
  name: string;
}

class LUN extends ConfigNode {
  readonly index: number;
  readonly tpgPath: string;

  constructor(fs: ConfigFS, tpgPath: string, index: number) {
    super(fs, fs.join(tpgPath, "lun", `lun_${index}`));
    this.index = index;
    this.tpgPath = tpgPath;
  }

  /** Name of the symlink inside lun_M/ (the storage object's name unless created with an alias). */
  async alias(): Promise<string | null> {
    return (await this.fs.links(this.path))[0] ?? null;
  }

  /** Absolute configfs path of the ed storage object, or null if unlinked. */
  async storageObjectPath(): Promise<string | null> {
    const [name] = await this.fs.links(this.path);
    return name === undefined ? null : this.fs.readlink(this.child(name));
  }

  async backstore(): Promise<BackstoreRef | null> {
    const target = await this.storageObjectPath();
    const m = target ? /\/core\/([a-z_]+)_(\d+)\/([^/]+)$/.exec(target) : null;
    return m ? { plugin: m[1]!, hbaIndex: Number(m[2]), name: m[3]! } : null;
  }

  /** Name of the ALUA target port group this LUN belongs to. */
  async aluaGroup(): Promise<string | null> {
    const raw = await this.fs.readOptional(this.child("alua_tg_pt_gp"));
    const m = raw ? /^[^:\n]+:\s*(\S+)/.exec(raw) : null;
    return m ? m[1]! : null;
  }

  /** Moves the LUN into another ALUA group of its storage object. */
  async setAluaGroup(name: string = DEFAULT_ALUA_GROUP): Promise<void> {
    assertIdent(name, "ALUA group name");
    await this.fs.write(this.child("alua_tg_pt_gp"), name);
  }

  async removeLink(): Promise<void> {
    for (const name of await this.fs.links(this.path))
      await this.fs.unlink(this.child(name));
  }
}

interface LUNCreateOptions {
  /** Name of the symlink inside lun_M/. Default: the storage object's name. */
  alias?: string;
}

class LUNManager extends ConfigManager<LUN> {
  private readonly tpg: TPG;

  constructor(fs: ConfigFS, tpg: TPG) {
    super(fs, fs.join(tpg.path, "lun"));
    this.tpg = tpg;
  }

  async list(): Promise<LUN[]> {
    return (await this.childIndices("lun")).map((i) => this.open(i));
  }

  async get(index: number): Promise<LUN | null> {
    return (await this.hasChild(`lun_${index}`)) ? this.open(index) : null;
  }

  /**  `storageObject` as LUN `index`. */
  async create(
    index: number,
    storageObject: StorageObject,
    options: LUNCreateOptions = {},
  ): Promise<LUN> {
    if (!Number.isInteger(index) || index < 0)
      throw new LIOError(`Invalid LUN index ${index}`);
    const alias = options.alias ?? storageObject.name;
    assertIdent(alias, "LUN alias");

    await this.makeChild(`lun_${index}`);
    const lun = this.open(index);
    try {
      await this.fs.symlink(storageObject.path, lun.path + "/" + alias);
    } catch (e) {
      await this.removeChild(`lun_${index}`).catch(() => {});
      throw new LIOError(
        `Failed to  "${storageObject.name}" as LUN ${index}: ${e instanceof Error ? e.message : String(e)}`,
        { code: (e as { code?: string }).code, cause: e },
      );
    }
    return lun;
  }

  async delete(target: number | LUN): Promise<void> {
    const lun = typeof target === "number" ? await this.get(target) : target;
    if (!lun)
      throw new LIOError(`LUN ${String(target)} not found`, { code: "ENOENT" });

    // ACL mapped LUNs that reference this LUN must go first.
    await this.tpg.acl.unmapLun(lun.index);
    await lun.removeLink();
    await this.removeChild(`lun_${lun.index}`);
  }

  async deleteAll(): Promise<void> {
    for (const lun of await this.list()) await this.delete(lun);
  }

  private open(index: number): LUN {
    return new LUN(this.fs, this.tpg.path, index);
  }
}

export { LUN, LUNManager };

export type { BackstoreRef, LUNCreateOptions };

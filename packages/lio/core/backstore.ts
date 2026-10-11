/**
 * Backstores:  /sys/kernel/config/target/core/<plugin>_<hba>/<name>/
 *
 *   Backstores                       (manager of every storage object)
 *   ├─ block   : BlockStorageObjectManager      (iblock)
 *   ├─ file    : FileStorageObjectManager       (fileio)
 *   ├─ ramdisk : RamdiskStorageObjectManager    (rd_mcp)
 *   └─ user    : UserBackedStorageObjectManager (TCMU)
 *
 *   StorageObject
 *   ├─ attrib : StorageObjectAttribController   (model: StorageObjectAttrib)
 *   ├─ wwn    : StorageObjectWwnController      (model: StorageObjectWwn)
 *   ├─ pr     : StorageObjectPrController       (model: StorageObjectPr)
 *   └─ alua   : ALUATargetPortGroupManager
 */

import {
  AttributeController,
  ConfigManager,
  ConfigNode,
  assertControlValue,
  assertIdent,
  attr,
} from "@/lib/base";
import type { AttrSchema, Codec } from "@/lib/base";
import { LIOError, isErrno } from "@/lib/configfs";
import type { ConfigFS, HostFS } from "@/lib/configfs";
import { ALUATargetPortGroupManager } from "@/core/alua";
import { StorageObjectPrController } from "@/core/pr";
import type {
  SavedAluaGroup,
  SavedAttrs,
  SavedBlockStorageObject,
  SavedFileStorageObject,
  SavedRamdiskStorageObject,
  SavedStorageObject,
  SavedUserStorageObject,
  StorageKind,
} from "@/config/types";

const CORE_HINT =
  "LIO core not available. Mount configfs and load the target modules: " +
  "mount -t configfs none /sys/kernel/config; modprobe target_core_mod target_core_iblock target_core_file";

const PAGE_SIZE = 4096;

/** Kernel plugin name -> the name used by targetcli / saved configurations. */
const PLUGIN_KIND: Readonly<Record<string, StorageKind>> = {
  iblock: "block",
  fileio: "fileio",
  rd_mcp: "ramdisk",
  user: "user",
};

const KINDS: readonly StorageKind[] = ["block", "fileio", "ramdisk", "user"];

/** "/backstores/block/disk0" */
function storageObjectRef(kind: StorageKind, name: string): string {
  return `/backstores/${kind}/${name}`;
}

function parseStorageObjectRef(
  ref: string,
): { kind: StorageKind; name: string } | null {
  const m = /^\/backstores\/([a-z]+)\/([^/]+)$/.exec(ref);
  const kind = KINDS.find((k) => k === m?.[1]);
  return kind && m ? { kind, name: m[2]! } : null;
}

/* -------------------------------------------------------------------------- */
/* attrib/                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Names are the exact configfs file names. The set differs slightly between
 * kernel versions; read() omits what is missing, getRaw()/setRaw() cover extras.
 */
interface StorageObjectAttrib {
  alua_support: boolean;
  block_size: number;
  emulate_3pc: boolean;
  emulate_caw: boolean;
  emulate_dpo: boolean;
  emulate_fua_read: boolean;
  emulate_fua_write: boolean;
  emulate_model_alias: boolean;
  emulate_pr: boolean;
  emulate_rest_reord: boolean;
  emulate_tas: boolean;
  emulate_tpu: boolean;
  emulate_tpws: boolean;
  emulate_ua_intlck_ctrl: number;
  emulate_write_cache: boolean;
  enforce_pr_isids: boolean;
  force_pr_aptpl: boolean;
  hw_block_size: number;
  hw_max_sectors: number;
  hw_pi_prot_type: number;
  hw_queue_depth: number;
  is_nonrot: boolean;
  max_unmap_block_desc_count: number;
  max_unmap_lba_count: number;
  max_write_same_len: number;
  optimal_sectors: number;
  pgr_support: boolean;
  pi_prot_type: number;
  pi_prot_verify: boolean;
  queue_depth: number;
  unmap_granularity: number;
  unmap_granularity_alignment: number;
  unmap_zeroes_data: boolean;
}

const STORAGE_OBJECT_ATTRIB: AttrSchema<StorageObjectAttrib> = {
  alua_support: attr.bool({ readOnly: true }),
  block_size: attr.int(),
  emulate_3pc: attr.bool(),
  emulate_caw: attr.bool(),
  emulate_dpo: attr.bool(),
  emulate_fua_read: attr.bool(),
  emulate_fua_write: attr.bool(),
  emulate_model_alias: attr.bool(),
  emulate_pr: attr.bool({ readOnly: true }),
  emulate_rest_reord: attr.bool(),
  emulate_tas: attr.bool(),
  emulate_tpu: attr.bool(),
  emulate_tpws: attr.bool(),
  emulate_ua_intlck_ctrl: attr.int(),
  emulate_write_cache: attr.bool(),
  enforce_pr_isids: attr.bool(),
  force_pr_aptpl: attr.bool(),
  hw_block_size: attr.int({ readOnly: true }),
  hw_max_sectors: attr.int({ readOnly: true }),
  hw_pi_prot_type: attr.int({ readOnly: true }),
  hw_queue_depth: attr.int({ readOnly: true }),
  is_nonrot: attr.bool(),
  max_unmap_block_desc_count: attr.int(),
  max_unmap_lba_count: attr.int(),
  max_write_same_len: attr.int(),
  optimal_sectors: attr.int(),
  pgr_support: attr.bool({ readOnly: true }),
  pi_prot_type: attr.int(),
  pi_prot_verify: attr.bool(),
  queue_depth: attr.int(),
  unmap_granularity: attr.int(),
  unmap_granularity_alignment: attr.int(),
  unmap_zeroes_data: attr.bool(),
};

class StorageObjectAttribController extends AttributeController<StorageObjectAttrib> {
  protected readonly schema = STORAGE_OBJECT_ATTRIB;
}

/* -------------------------------------------------------------------------- */
/* wwn/                                                                       */
/* -------------------------------------------------------------------------- */

interface StorageObjectWwn {
  /** T10 VPD unit serial (a UUID by default). */
  vpd_unit_serial: string;
}

/** The kernel prints "T10 VPD Unit Serial Number: <serial>". */
const vpdSerialCodec: Codec<string> = {
  decode: (raw) => raw.split(":").pop()!.trim(),
  encode: (v) => v,
};

const STORAGE_OBJECT_WWN: AttrSchema<StorageObjectWwn> = {
  vpd_unit_serial: attr.custom(vpdSerialCodec),
};

class StorageObjectWwnController extends AttributeController<StorageObjectWwn> {
  protected readonly schema = STORAGE_OBJECT_WWN;
}

/* -------------------------------------------------------------------------- */
/* StorageObject                                                              */
/* -------------------------------------------------------------------------- */

type SavedBase = {
  name: string;
  wwn: string;
  attributes: SavedAttrs;
  alua_tpgs: SavedAluaGroup[];
};

abstract class StorageObject extends ConfigNode {
  /** Name used by targetcli and saved configurations (block, fileio, ramdisk, user). */
  abstract readonly kind: StorageKind;

  readonly plugin: string;
  readonly hbaIndex: number;
  readonly name: string;
  readonly attrib: StorageObjectAttribController;
  readonly wwn: StorageObjectWwnController;
  readonly pr: StorageObjectPrController;
  readonly alua: ALUATargetPortGroupManager;

  constructor(fs: ConfigFS, plugin: string, hbaIndex: number, name: string) {
    super(fs, fs.resolve("core", `${plugin}_${hbaIndex}`, name));
    this.plugin = plugin;
    this.hbaIndex = hbaIndex;
    this.name = name;
    this.attrib = new StorageObjectAttribController(fs, this.child("attrib"));
    this.wwn = new StorageObjectWwnController(fs, this.child("wwn"));
    this.pr = new StorageObjectPrController(fs, this.child("pr"));
    this.alua = new ALUATargetPortGroupManager(fs, this.child("alua"));
  }

  get hbaPath(): string {
    return this.fs.resolve("core", `${this.plugin}_${this.hbaIndex}`);
  }

  /** "/backstores/<kind>/<name>", the way LUNs and saved configs refer to it. */
  get ref(): string {
    return storageObjectRef(this.kind, this.name);
  }

  /** Shortcut for wwn.get("vpd_unit_serial"). */
  serial(): Promise<string> {
    return this.wwn.get("vpd_unit_serial");
  }

  async isEnabled(): Promise<boolean> {
    return (await this.fs.read(this.child("enable"))) === "1";
  }

  async enable(): Promise<void> {
    await this.fs.write(this.child("enable"), "1");
  }

  async udevPath(): Promise<string> {
    return (await this.fs.readOptional(this.child("udev_path"))) ?? "";
  }

  /** Raw plugin-specific description. */
  info(): Promise<string> {
    return this.fs.read(this.child("info"));
  }

  /** Saved form of this storage object (see config/types.ts). */
  abstract dump(): Promise<SavedStorageObject>;

  protected async dumpCommon(): Promise<SavedBase> {
    return {
      name: this.name,
      wwn: await this.serial(),
      attributes: await this.attrib.dump({ numeric: true }),
      alua_tpgs: await this.alua.dump(),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Manager base                                                               */
/* -------------------------------------------------------------------------- */

interface StorageObjectQuery {
  name?: string;
  /** VPD unit serial */
  wwn?: string;
}

abstract class StorageObjectManager<
  TStorageObject extends StorageObject,
  TCreateOptions extends { name: string },
> extends ConfigManager<TStorageObject> {
  protected abstract readonly plugin: string;
  protected abstract open(hbaIndex: number, name: string): TStorageObject;

  abstract create(options: TCreateOptions): Promise<TStorageObject>;

  constructor(fs: ConfigFS) {
    super(fs, fs.resolve("core"));
  }

  async list(): Promise<TStorageObject[]> {
    await this.fs.assertExists(this.path, CORE_HINT);
    const result: TStorageObject[] = [];
    for (const hba of await this.childIndices(this.plugin)) {
      for (const name of await this.fs.dirs(this.hbaPath(hba)))
        result.push(this.open(hba, name));
    }
    return result;
  }

  async get(query: StorageObjectQuery): Promise<TStorageObject | null> {
    if (query.name === undefined && query.wwn === undefined) {
      throw new LIOError("get() requires a name and/or a wwn");
    }
    for (const so of await this.list()) {
      if (query.name !== undefined && so.name !== query.name) continue;
      if (query.wwn !== undefined && (await so.serial()) !== query.wwn)
        continue;
      return so;
    }
    return null;
  }

  /** Delete by object or by VPD serial. The object must no longer be ed as a LUN. */
  async delete(target: string | TStorageObject): Promise<void> {
    const so =
      typeof target === "string" ? await this.get({ wwn: target }) : target;
    if (!so)
      throw new LIOError(`Storage object not found: ${String(target)}`, {
        code: "ENOENT",
      });

    // User-created ALUA groups are children of the device and would block rmdir.
    await so.alua.deleteCustom();

    try {
      await this.fs.rmdir(so.path);
    } catch (e) {
      if (isErrno(e, "EBUSY")) {
        throw new LIOError(
          `Storage object "${so.name}" is still in use (ed as a LUN?). Delete the LUN first.`,
          { code: "EBUSY", cause: e },
        );
      }
      throw e;
    }

    // Drop the now-empty HBA; leave it if other devices still live there.
    try {
      await this.fs.rmdir(so.hbaPath);
    } catch (e) {
      if (!isErrno(e, "ENOTEMPTY", "EBUSY")) throw e;
    }
  }

  async deleteAll(): Promise<void> {
    for (const so of await this.list()) await this.delete(so);
  }

  protected hbaPath(index: number): string {
    return this.child(`${this.plugin}_${index}`);
  }

  /** One HBA per storage object, like targetcli. mkdir is atomic, so this is race-free. */
  protected async allocateHba(): Promise<number> {
    await this.fs.assertExists(this.path, CORE_HINT);
    for (let i = 0; i < 65536; i++) {
      try {
        await this.fs.mkdir(this.hbaPath(i));
        return i;
      } catch (e) {
        if (!isErrno(e, "EEXIST")) throw e;
      }
    }
    throw new LIOError(`No free HBA index for plugin ${this.plugin}`);
  }

  /** mkdir hba + device, write `control`, enable, set the serial. Rolls back on failure. */
  protected async provision(
    name: string,
    control: string,
    wwn?: string,
  ): Promise<TStorageObject> {
    if (wwn !== undefined) assertIdent(wwn, "VPD unit serial");
    const hba = await this.allocateHba();
    const hbaPath = this.hbaPath(hba);
    const devPath = this.fs.join(hbaPath, name);
    try {
      await this.fs.mkdir(devPath);
      await this.fs.write(this.fs.join(devPath, "control"), control);
      await this.fs.write(this.fs.join(devPath, "enable"), "1");
      // The kernel only accepts a new serial while the device is not ed.
      if (wwn !== undefined)
        await this.fs.write(
          this.fs.join(devPath, "wwn", "vpd_unit_serial"),
          wwn,
        );
    } catch (e) {
      await this.fs.rmdir(devPath).catch(() => {});
      await this.fs.rmdir(hbaPath).catch(() => {});
      throw new LIOError(
        `Failed to create ${this.plugin} storage object "${name}": ${e instanceof Error ? e.message : String(e)}`,
        { code: (e as { code?: string }).code, cause: e },
      );
    }
    return this.open(hba, name);
  }

  protected async assertNameFree(name: string): Promise<void> {
    assertIdent(name, "storage object name");
    if (await this.get({ name })) {
      throw new LIOError(`Storage object "${name}" already exists`, {
        code: "EEXIST",
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* block (iblock)                                                             */
/* -------------------------------------------------------------------------- */

class BlockStorageObject extends StorageObject {
  readonly kind = "block" as const;

  constructor(fs: ConfigFS, hbaIndex: number, name: string) {
    super(fs, "iblock", hbaIndex, name);
  }

  /** Backing block device. */
  dev(): Promise<string> {
    return this.udevPath();
  }

  async isReadOnly(): Promise<boolean> {
    return /readonly:\s*1/i.test(await this.info());
  }

  async dump(): Promise<SavedBlockStorageObject> {
    return {
      ...(await this.dumpCommon()),
      plugin: "block",
      dev: await this.dev(),
      readonly: await this.isReadOnly(),
    };
  }
}

interface BlockCreateOptions {
  name: string;
  dev: string;
  readOnly?: boolean;
  /** VPD unit serial; generated by the kernel when omitted. */
  wwn?: string;
}

class BlockStorageObjectManager extends StorageObjectManager<
  BlockStorageObject,
  BlockCreateOptions
> {
  protected readonly plugin = "iblock";
  private readonly host: HostFS;

  constructor(fs: ConfigFS, host: HostFS) {
    super(fs);
    this.host = host;
  }

  protected open(hbaIndex: number, name: string): BlockStorageObject {
    return new BlockStorageObject(this.fs, hbaIndex, name);
  }

  async create({
    name,
    dev,
    readOnly = false,
    wwn,
  }: BlockCreateOptions): Promise<BlockStorageObject> {
    await this.fs.assertExists(this.path, CORE_HINT);
    await this.assertNameFree(name);
    assertControlValue(dev, "dev");

    const st = await this.host.stat(dev);
    if (!st)
      throw new LIOError(`Device ${dev} does not exist`, { code: "ENOENT" });
    if (!st.isBlockDevice) throw new LIOError(`${dev} is not a block device`);

    return this.provision(
      name,
      `udev_path=${dev}${readOnly ? ",readonly=1" : ""}`,
      wwn,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* file (fileio)                                                              */
/* -------------------------------------------------------------------------- */

class FileStorageObject extends StorageObject {
  readonly kind = "fileio" as const;

  constructor(fs: ConfigFS, hbaIndex: number, name: string) {
    super(fs, "fileio", hbaIndex, name);
  }

  /** Backing file (or block device). */
  file(): Promise<string> {
    return this.udevPath();
  }

  async size(): Promise<number> {
    const m = /Size:\s*(\d+)/.exec(await this.info());
    return m ? Number(m[1]) : 0;
  }

  /** True when the page cache is used (write-back). */
  async isWriteBack(): Promise<boolean> {
    return /Mode:\s*Buffered/i.test(await this.info());
  }

  async dump(): Promise<SavedFileStorageObject> {
    return {
      ...(await this.dumpCommon()),
      plugin: "fileio",
      dev: await this.file(),
      size: await this.size(),
      write_back: await this.isWriteBack(),
    };
  }
}

interface FileCreateOptions {
  name: string;
  file: string;
  /** Required when the file does not exist yet; it is then created sparse. */
  size?: number;
  /** Use the page cache (write-back). Default: write-through. */
  writeBack?: boolean;
  wwn?: string;
}

class FileStorageObjectManager extends StorageObjectManager<
  FileStorageObject,
  FileCreateOptions
> {
  protected readonly plugin = "fileio";
  private readonly host: HostFS;

  constructor(fs: ConfigFS, host: HostFS) {
    super(fs);
    this.host = host;
  }

  protected open(hbaIndex: number, name: string): FileStorageObject {
    return new FileStorageObject(this.fs, hbaIndex, name);
  }

  async create({
    name,
    file,
    size,
    writeBack = false,
    wwn,
  }: FileCreateOptions): Promise<FileStorageObject> {
    await this.fs.assertExists(this.path, CORE_HINT);
    await this.assertNameFree(name);
    assertControlValue(file, "file");

    const st = await this.host.stat(file);
    const parts = [`fd_dev_name=${file}`];
    let createdFile = false;

    if (!st) {
      if (!size || size <= 0)
        throw new LIOError(
          `${file} does not exist; "size" is required to create it`,
        );
      await this.host.createSparseFile(file, size);
      createdFile = true;
      parts.push(`fd_dev_size=${size}`);
    } else if (st.isBlockDevice) {
      // size comes from the device
    } else if (st.isFile) {
      if (st.size === 0) throw new LIOError(`${file} is empty`);
      parts.push(`fd_dev_size=${st.size}`);
    } else {
      throw new LIOError(
        `${file} is neither a regular file nor a block device`,
      );
    }

    if (writeBack) parts.push("fd_buffered_io=1");

    try {
      return await this.provision(name, parts.join(","), wwn);
    } catch (e) {
      if (createdFile) await this.host.remove(file);
      throw e;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* ramdisk (rd_mcp)                                                           */
/* -------------------------------------------------------------------------- */

class RamdiskStorageObject extends StorageObject {
  readonly kind = "ramdisk" as const;

  constructor(fs: ConfigFS, hbaIndex: number, name: string) {
    super(fs, "rd_mcp", hbaIndex, name);
  }

  /** Size in bytes. */
  async size(): Promise<number> {
    const m = /PAGES\/PAGE_SIZE:\s*(\d+)\*(\d+)/.exec(await this.info());
    return m ? Number(m[1]) * Number(m[2]) : 0;
  }

  /** True when reads/writes are discarded (benchmark mode). */
  async isNullIo(): Promise<boolean> {
    return /nullio:\s*1/i.test(await this.info());
  }

  async dump(): Promise<SavedRamdiskStorageObject> {
    return {
      ...(await this.dumpCommon()),
      plugin: "ramdisk",
      size: await this.size(),
      nullio: await this.isNullIo(),
    };
  }
}

interface RamdiskCreateOptions {
  name: string;
  /** Bytes; rounded up to whole 4 KiB pages. */
  size: number;
  /** Discard all I/O (useful for benchmarks). */
  nullio?: boolean;
  wwn?: string;
}

class RamdiskStorageObjectManager extends StorageObjectManager<
  RamdiskStorageObject,
  RamdiskCreateOptions
> {
  protected readonly plugin = "rd_mcp";

  protected open(hbaIndex: number, name: string): RamdiskStorageObject {
    return new RamdiskStorageObject(this.fs, hbaIndex, name);
  }

  async create({
    name,
    size,
    nullio = false,
    wwn,
  }: RamdiskCreateOptions): Promise<RamdiskStorageObject> {
    await this.fs.assertExists(this.path, CORE_HINT);
    await this.assertNameFree(name);
    if (!Number.isInteger(size) || size <= 0)
      throw new LIOError(`Invalid ramdisk size ${size}`);

    const pages = Math.ceil(size / PAGE_SIZE);
    return this.provision(
      name,
      `rd_pages=${pages}${nullio ? ",rd_nullio=1" : ""}`,
      wwn,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* user (TCMU)                                                                */
/* -------------------------------------------------------------------------- */

/** A device whose I/O is handled in user space by tcmu-runner. */
class UserBackedStorageObject extends StorageObject {
  readonly kind = "user" as const;

  constructor(fs: ConfigFS, hbaIndex: number, name: string) {
    super(fs, "user", hbaIndex, name);
  }

  /** "<handler>/<config>", e.g. "file//var/lib/disk.img". */
  async config(): Promise<string> {
    const m = /Config:\s*(\S+)/.exec(await this.info());
    return m ? m[1]! : "";
  }

  /** Size in bytes. */
  async size(): Promise<number> {
    const m = /Size:\s*(\d+)/.exec(await this.info());
    return m ? Number(m[1]) : 0;
  }

  async dump(): Promise<SavedUserStorageObject> {
    return {
      ...(await this.dumpCommon()),
      plugin: "user",
      config: await this.config(),
      size: await this.size(),
      hw_max_sectors: await this.attrib.get("hw_max_sectors"),
    };
  }
}

interface UserBackedCreateOptions {
  name: string;
  /** "<handler>/<config>", e.g. "file//var/lib/disk.img". */
  config: string;
  size: number;
  hwMaxSectors?: number;
  wwn?: string;
}

class UserBackedStorageObjectManager extends StorageObjectManager<
  UserBackedStorageObject,
  UserBackedCreateOptions
> {
  protected readonly plugin = "user";

  protected open(hbaIndex: number, name: string): UserBackedStorageObject {
    return new UserBackedStorageObject(this.fs, hbaIndex, name);
  }

  async create({
    name,
    config,
    size,
    hwMaxSectors,
    wwn,
  }: UserBackedCreateOptions): Promise<UserBackedStorageObject> {
    await this.fs.assertExists(this.path, CORE_HINT);
    await this.assertNameFree(name);
    assertControlValue(config, "config");
    if (!Number.isInteger(size) || size <= 0)
      throw new LIOError(`Invalid size ${size}`);

    const parts = [`dev_config=${config}`, `dev_size=${size}`];
    if (hwMaxSectors !== undefined)
      parts.push(`hw_max_sectors=${hwMaxSectors}`);
    return this.provision(name, parts.join(","), wwn);
  }
}

/* -------------------------------------------------------------------------- */
/* Backstores                                                                 */
/* -------------------------------------------------------------------------- */

type AnyStorageObjectManager = StorageObjectManager<
  StorageObject,
  { name: string }
>;

class Backstores extends ConfigManager<StorageObject> {
  readonly block: BlockStorageObjectManager;
  readonly file: FileStorageObjectManager;
  readonly ramdisk: RamdiskStorageObjectManager;
  readonly user: UserBackedStorageObjectManager;

  constructor(fs: ConfigFS, host: HostFS) {
    super(fs, fs.resolve("core"));
    this.block = new BlockStorageObjectManager(fs, host);
    this.file = new FileStorageObjectManager(fs, host);
    this.ramdisk = new RamdiskStorageObjectManager(fs);
    this.user = new UserBackedStorageObjectManager(fs);
  }

  /** False when the LIO core modules are not loaded / configfs is not mounted. */
  isAvailable(): Promise<boolean> {
    return this.exists();
  }

  /** Every storage object of every plugin. */
  async list(): Promise<StorageObject[]> {
    const result: StorageObject[] = [];
    for (const kind of KINDS) result.push(...(await this.manager(kind).list()));
    return result;
  }

  /** By reference ("/backstores/block/disk0") or by kind + name. */
  async get(
    ref: string | { kind: StorageKind; name: string },
  ): Promise<StorageObject | null> {
    const parsed = typeof ref === "string" ? parseStorageObjectRef(ref) : ref;
    return parsed ? this.manager(parsed.kind).get({ name: parsed.name }) : null;
  }

  async delete(target: string | StorageObject): Promise<void> {
    const so = typeof target === "string" ? await this.get(target) : target;
    if (!so)
      throw new LIOError(`Storage object not found: ${String(target)}`, {
        code: "ENOENT",
      });
    await this.manager(so.kind).delete(so);
  }

  /** The storage objects must no longer be ed as LUNs. */
  async deleteAll(): Promise<void> {
    for (const so of await this.list()) await this.delete(so);
  }

  private manager(kind: StorageKind): AnyStorageObjectManager {
    switch (kind) {
      case "block":
        return this.block;
      case "fileio":
        return this.file;
      case "ramdisk":
        return this.ramdisk;
      case "user":
        return this.user;
    }
  }
}

export {
  PLUGIN_KIND,
  storageObjectRef,
  parseStorageObjectRef,
  STORAGE_OBJECT_ATTRIB,
  StorageObjectAttribController,
  STORAGE_OBJECT_WWN,
  StorageObjectWwnController,
  StorageObject,
  StorageObjectManager,
  BlockStorageObject,
  BlockStorageObjectManager,
  FileStorageObject,
  FileStorageObjectManager,
  RamdiskStorageObject,
  RamdiskStorageObjectManager,
  UserBackedStorageObject,
  UserBackedStorageObjectManager,
  Backstores,
};

export type {
  StorageObjectAttrib,
  StorageObjectWwn,
  StorageObjectQuery,
  BlockCreateOptions,
  FileCreateOptions,
  RamdiskCreateOptions,
  UserBackedCreateOptions,
};

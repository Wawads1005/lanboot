/**
 * /sys/kernel/config/target/
 *
 *   Root
 *   ├─ version(), dbroot()/setDbroot()
 *   └─ fabric : FabricManager
 *        FabricModule  (iscsi/, loopback/, ...)  -> targets()
 */

import { ConfigManager, ConfigNode, assertIdent } from "@/lib/base";
import { LIOError } from "@/lib/configfs";
import type { ConfigFS } from "@/lib/configfs";

/** Directories of a fabric module that are not targets. */
const NON_TARGET_DIRS = new Set(["discovery_auth"]);

class FabricModule extends ConfigNode {
  readonly name: string;

  constructor(fs: ConfigFS, name: string) {
    super(fs, fs.resolve(name));
    this.name = name;
  }

  /** WWNs of the targets configured on this fabric. */
  async targets(): Promise<string[]> {
    return (await this.fs.dirs(this.path)).filter(
      (n) => !NON_TARGET_DIRS.has(n),
    );
  }
}

class FabricManager extends ConfigManager<FabricModule> {
  async list(): Promise<FabricModule[]> {
    return (await this.childDirs())
      .filter((n) => n !== "core")
      .map((n) => new FabricModule(this.fs, n));
  }

  async get(name: string): Promise<FabricModule | null> {
    assertIdent(name, "fabric module name");
    return name !== "core" && (await this.hasChild(name))
      ? new FabricModule(this.fs, name)
      : null;
  }
}

class Root extends ConfigNode {
  readonly fabric: FabricManager;

  constructor(fs: ConfigFS) {
    super(fs, fs.root);
    this.fabric = new FabricManager(fs, this.path);
  }

  /** True when configfs is mounted and the LIO core is loaded. */
  isAvailable(): Promise<boolean> {
    return this.fs.exists(this.child("core"));
  }

  /** Kernel banner, e.g. "Target Engine Core ConfigFS Infrastructure v5.0 on Linux/x86_64 on 6.1.0". */
  version(): Promise<string> {
    return this.fs.read(this.child("version"));
  }

  /** Directory where the kernel keeps persistent reservation / ALUA metadata. */
  dbroot(): Promise<string> {
    return this.fs.read(this.child("dbroot"));
  }

  /** Only possible while no storage object exists. */
  async setDbroot(path: string): Promise<void> {
    if (!path.startsWith("/"))
      throw new LIOError(`dbroot must be an absolute path, got "${path}"`);
    await this.fs.write(this.child("dbroot"), path);
  }
}

export { FabricModule, FabricManager, Root };

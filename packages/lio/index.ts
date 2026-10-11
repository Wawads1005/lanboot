import { Backstores } from "@/core/backstore";
import { Root } from "@/core/root";
import { LIOConfig } from "@/config/config";
import type { ConfigStoreOptions } from "@/config/store";
import { ConfigFS, HostFS } from "@/lib/configfs";
import { iSCSIManager } from "@/iscsi/target";

interface LIOOptions {
  /** Inject a different ConfigFS (custom root, test double, ...). */
  configfs?: ConfigFS;
  /** Inject a different HostFS (block device / backing file checks, config file I/O). */
  host?: HostFS;
  /** Location of the saved configuration and its backups. */
  config?: ConfigStoreOptions;
}

class LIO {
  readonly root: Root;
  readonly backstores: Backstores;
  readonly iscsi: iSCSIManager;
  readonly config: LIOConfig;

  constructor(options: LIOOptions = {}) {
    const fs = options.configfs ?? new ConfigFS();
    const host = options.host ?? new HostFS();
    this.root = new Root(fs);
    this.backstores = new Backstores(fs, host);
    this.iscsi = new iSCSIManager(fs);
    this.config = new LIOConfig(
      { backstores: this.backstores, iscsi: this.iscsi },
      host,
      options.config,
    );
  }
}

export type { LIOOptions };
export { LIO };
export * from "@/lib/base";
export * from "@/core/alua";
export * from "@/core/backstore";
export * from "@/core/pr";
export * from "@/core/root";
export * from "@/lib/configfs";
export * from "@/iscsi/acl";
export * from "@/iscsi/auth";
export * from "@/iscsi/lun";
export * from "@/iscsi/portal";
export * from "@/iscsi/session";
export * from "@/iscsi/target";
export * from "@/iscsi/tpg";
export * from "@/lib/wwn";
export * from "@/config/config";
export * from "@/config/dumper";
export * from "@/config/restorer";
export * from "@/config/store";
export * from "@/config/types";
export * from "@/config/validate";

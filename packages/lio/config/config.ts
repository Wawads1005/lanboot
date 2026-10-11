/**
 * lio.config  -  saving, loading and restoring the whole configuration.
 *
 *   LIOConfig
 *   ├─ dump()               live kernel state -> SavedConfig
 *   ├─ restore(config)      SavedConfig (or parsed JSON) -> kernel
 *   ├─ clear()              remove every target and storage object
 *   ├─ save() / load()      the same, through the file in `store`
 *   └─ store : ConfigStore  file location, backups
 */

import type { HostFS } from "@/lib/configfs";
import { ConfigDumper } from "@/config/dumper";
import type { ConfigDeps } from "@/config/dumper";
import { ConfigRestorer } from "@/config/restorer";
import type { RestoreOptions, RestoreResult } from "@/config/restorer";
import { ConfigStore } from "@/config/store";
import type { ConfigStoreOptions } from "@/config/store";
import type { SavedConfig } from "@/config/types";

class LIOConfig {
  readonly store: ConfigStore;
  private readonly dumper: ConfigDumper;
  private readonly restorer: ConfigRestorer;

  constructor(
    deps: ConfigDeps,
    host: HostFS,
    options: ConfigStoreOptions = {},
  ) {
    this.dumper = new ConfigDumper(deps);
    this.restorer = new ConfigRestorer(deps);
    this.store = new ConfigStore(host, options);
  }

  dump(): Promise<SavedConfig> {
    return this.dumper.dump();
  }

  restore(config: unknown, options?: RestoreOptions): Promise<RestoreResult> {
    return this.restorer.restore(config, options);
  }

  clear(): Promise<void> {
    return this.restorer.clear();
  }

  /** Dumps the running configuration into the config file; returns its path. */
  async save(path?: string): Promise<string> {
    return this.store.save(await this.dump(), path);
  }

  /** Reads the config file and applies it. */
  async load(path?: string, options?: RestoreOptions): Promise<RestoreResult> {
    return this.restore(await this.store.load(path), options);
  }
}

export { LIOConfig };

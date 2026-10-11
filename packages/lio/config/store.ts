/**
 * The saved-configuration file (default /etc/target/saveconfig.json, the path
 * targetcli uses) and its backups.
 *
 *   ConfigStore
 *   ├─ load(path?)      read + validate
 *   ├─ save(config)     back up the old file, then replace it atomically (mode 0600:
 *   │                   the file contains CHAP passwords)
 *   └─ backups()        newest first, pruned to `maxBackups`
 */

import type { HostFS } from "@/lib/configfs";
import { LIOError } from "@/lib/configfs";
import { parseSavedConfig } from "@/config/validate";
import type { SavedConfig } from "@/config/types";

const DEFAULT_CONFIG_PATH = "/etc/target/saveconfig.json";

interface ConfigStoreOptions {
  /** Where save()/load() go by default. */
  path?: string;
  /** Default: "backup" next to the config file. */
  backupDir?: string;
  /** Default: 10. */
  maxBackups?: number;
}

/** Stable output (sorted keys, 2-space indent) so saved files diff cleanly. */
function stringifyConfig(config: SavedConfig): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, sort(v)]),
      );
    return value;
  };
  return JSON.stringify(sort(config), null, 2) + "\n";
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

function timestamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .replace(/\.(\d+)Z$/, "-$1");
}

class ConfigStore {
  readonly path: string;
  readonly backupDir: string;
  readonly maxBackups: number;
  private readonly host: HostFS;

  constructor(host: HostFS, options: ConfigStoreOptions = {}) {
    this.host = host;
    this.path = options.path ?? DEFAULT_CONFIG_PATH;
    this.backupDir = options.backupDir ?? `${dirname(this.path)}/backup`;
    this.maxBackups = options.maxBackups ?? 10;
  }

  async exists(path: string = this.path): Promise<boolean> {
    return (await this.host.readText(path)) !== null;
  }

  async load(path: string = this.path): Promise<SavedConfig> {
    const text = await this.host.readText(path);
    if (text === null)
      throw new LIOError(`Configuration file ${path} does not exist`, {
        code: "ENOENT",
      });
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new LIOError(
        `Configuration file ${path} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
    return parseSavedConfig(json);
  }

  /** Returns the path written. The previous file (if different) is kept in backupDir. */
  async save(config: SavedConfig, path: string = this.path): Promise<string> {
    const text = stringifyConfig(config);
    const previous = await this.host.readText(path);
    if (previous !== null && previous !== text) await this.backup(previous);
    await this.host.writeText(path, text, 0o600);
    return path;
  }

  /** Backup file paths, newest first. */
  async backups(): Promise<string[]> {
    return (await this.host.listFiles(this.backupDir))
      .filter((n) => /^saveconfig-.+\.json$/.test(n))
      .sort()
      .reverse()
      .map((n) => `${this.backupDir}/${n}`);
  }

  private async backup(text: string): Promise<void> {
    await this.host.writeText(
      `${this.backupDir}/saveconfig-${timestamp(new Date())}.json`,
      text,
      0o600,
    );
    for (const old of (await this.backups()).slice(this.maxBackups))
      await this.host.remove(old);
  }
}

export type { ConfigStoreOptions };
export { DEFAULT_CONFIG_PATH, stringifyConfig, ConfigStore };

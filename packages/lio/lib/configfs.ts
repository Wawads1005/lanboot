/**
 * Filesystem abstraction layer.
 *
 * Nothing outside this file touches `node:fs/promises`. Every other class
 * receives a `ConfigFS` (and, where needed, a `HostFS`) through its
 * constructor, i.e. composition. That makes the whole library testable against
 * a temp directory or a fake implementation.
 */

import fsPromises from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_CONFIGFS_ROOT = "/sys/kernel/config/target";

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

function errnoOf(e: unknown): string {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? code : "";
}

function isErrno(e: unknown, ...codes: string[]): boolean {
  return codes.includes(errnoOf(e));
}

class LIOError extends Error {
  readonly code?: string;

  constructor(
    message: string,
    options: { code?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
  }
}

const ERRNO_TEXT: Record<string, string> = {
  EEXIST: "already exists",
  ENOENT: "no such file or directory",
  ENOTDIR: "not a directory",
  EBUSY: "resource busy (still referenced / in use)",
  ENOTEMPTY: "directory not empty",
  EACCES: "permission denied (are you root?)",
  EPERM: "operation not permitted (are you root?)",
  EINVAL: "value or state rejected by the kernel",
  ENODEV: "no such device",
  EIO: "I/O error reported by the kernel",
};

/** Wraps a raw errno failure; `.code` keeps the errno so callers can branch on it. */
class FSError extends LIOError {
  readonly op: string;
  readonly path: string;

  constructor(op: string, p: string, cause: unknown) {
    const code = errnoOf(cause);
    const text =
      ERRNO_TEXT[code] ??
      (cause instanceof Error ? cause.message : String(cause));
    super(`${op} ${p}: ${text}`, { code: code || undefined, cause });
    this.op = op;
    this.path = p;
  }
}

/* -------------------------------------------------------------------------- */
/* ConfigFS                                                                   */
/* -------------------------------------------------------------------------- */

type EntryType = "dir" | "file" | "link" | "other";

interface ConfigFSEntry {
  name: string;
  type: EntryType;
}

function entryType(d: fs.Dirent): EntryType {
  if (d.isDirectory()) return "dir";
  if (d.isSymbolicLink()) return "link";
  if (d.isFile()) return "file";
  return "other";
}

class ConfigFS {
  readonly root: string;

  constructor(root: string = DEFAULT_CONFIGFS_ROOT) {
    this.root = root;
  }

  /* ----- paths ----- */

  join(base: string, ...segments: string[]): string {
    return path.posix.join(base, ...segments);
  }

  /** Absolute path below the configured root. */
  resolve(...segments: string[]): string {
    return path.posix.join(this.root, ...segments);
  }

  /* ----- queries ----- */

  async exists(p: string): Promise<boolean> {
    try {
      await fsPromises.lstat(p);
      return true;
    } catch (e) {
      if (isErrno(e, "ENOENT", "ENOTDIR")) return false;
      throw new FSError("lstat", p, e);
    }
  }

  async assertExists(p: string, hint: string): Promise<void> {
    if (!(await this.exists(p))) throw new LIOError(hint, { code: "ENOENT" });
  }

  /** Directory listing; a missing directory yields []. */
  async list(p: string): Promise<ConfigFSEntry[]> {
    try {
      const entries = await fsPromises.readdir(p, { withFileTypes: true });
      return entries.map((d) => ({ name: d.name, type: entryType(d) }));
    } catch (e) {
      if (isErrno(e, "ENOENT", "ENOTDIR")) return [];
      throw new FSError("readdir", p, e);
    }
  }

  async dirs(p: string): Promise<string[]> {
    return (await this.list(p))
      .filter((e) => e.type === "dir")
      .map((e) => e.name);
  }

  async files(p: string): Promise<string[]> {
    return (await this.list(p))
      .filter((e) => e.type === "file")
      .map((e) => e.name);
  }

  async links(p: string): Promise<string[]> {
    return (await this.list(p))
      .filter((e) => e.type === "link")
      .map((e) => e.name);
  }

  /* ----- directories & links ----- */

  async mkdir(p: string): Promise<void> {
    await this.io("mkdir", p, () => fsPromises.mkdir(p));
  }

  async rmdir(p: string): Promise<void> {
    await this.io("rmdir", p, () => fsPromises.rmdir(p));
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    await this.io("symlink", linkPath, () =>
      fsPromises.symlink(target, linkPath),
    );
  }

  async unlink(p: string): Promise<void> {
    await this.io("unlink", p, () => fsPromises.unlink(p));
  }

  async readlink(p: string): Promise<string> {
    return this.io("readlink", p, () => fsPromises.readlink(p));
  }

  /* ----- attribute files ----- */

  async read(p: string): Promise<string> {
    return this.io("read", p, async () =>
      (await fsPromises.readFile(p, "utf8")).replace(/\0/g, "").trim(),
    );
  }

  /** Like read(), but a missing attribute yields null (attributes vary per kernel). */
  async readOptional(p: string): Promise<string | null> {
    try {
      return await this.read(p);
    } catch (e) {
      if (isErrno(e, "ENOENT")) return null;
      throw e;
    }
  }

  /**
   * configfs wants exactly one write() per attribute, and many attributes are
   * write-only (e.g. `control`), so the file is opened O_WRONLY, never r+.
   */
  async write(p: string, value: string): Promise<void> {
    await this.io("write", p, () =>
      fsPromises.writeFile(p, value, { flag: "w" }),
    );
  }

  private async io<T>(op: string, p: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw new FSError(op, p, e);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* HostFS: the ordinary filesystem (block devices, backing files, saved config) */
/* -------------------------------------------------------------------------- */

interface HostStat {
  isBlockDevice: boolean;
  isFile: boolean;
  size: number;
}

class HostFS {
  /** Follows symlinks (LVM, /dev/disk/by-id, ...). null if missing. */
  async stat(p: string): Promise<HostStat | null> {
    try {
      const st = await fsPromises.stat(p);
      return {
        isBlockDevice: st.isBlockDevice(),
        isFile: st.isFile(),
        size: st.size,
      };
    } catch (e) {
      if (isErrno(e, "ENOENT")) return null;
      throw new FSError("stat", p, e);
    }
  }

  async createSparseFile(p: string, size: number): Promise<void> {
    try {
      const fh = await fsPromises.open(p, "wx");
      try {
        await fh.truncate(size);
      } finally {
        await fh.close();
      }
    } catch (e) {
      throw new FSError("create", p, e);
    }
  }

  async remove(p: string): Promise<void> {
    await fsPromises.unlink(p).catch(() => {});
  }

  /** UTF-8 contents of a regular file, or null if it does not exist. */
  async readText(p: string): Promise<string | null> {
    try {
      return await fsPromises.readFile(p, "utf8");
    } catch (e) {
      if (isErrno(e, "ENOENT")) return null;
      throw new FSError("read", p, e);
    }
  }

  /**
   * Replaces `p` atomically (write a temp file, fsync, rename), creating parent
   * directories. A crash can never leave a half-written file behind.
   */
  async writeText(p: string, data: string, mode = 0o600): Promise<void> {
    const tmp = `${p}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await fsPromises.mkdir(path.dirname(p), { recursive: true });
      const fh = await fsPromises.open(tmp, "wx", mode);
      try {
        await fh.writeFile(data, "utf8");
        await fh.sync();
      } finally {
        await fh.close();
      }
      await fsPromises.rename(tmp, p);
    } catch (e) {
      await fsPromises.unlink(tmp).catch(() => {});
      throw new FSError("write", p, e);
    }
  }

  /** Names of the regular files in a directory; a missing directory yields []. */
  async listFiles(p: string): Promise<string[]> {
    try {
      const entries = await fsPromises.readdir(p, { withFileTypes: true });
      return entries.filter((d) => d.isFile()).map((d) => d.name);
    } catch (e) {
      if (isErrno(e, "ENOENT", "ENOTDIR")) return [];
      throw new FSError("readdir", p, e);
    }
  }
}

export { ConfigFS, FSError, HostFS, LIOError, errnoOf, isErrno };
export type { ConfigFSEntry, EntryType, HostStat };

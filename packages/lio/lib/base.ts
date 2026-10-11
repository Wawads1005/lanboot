/**
 * Building blocks shared by every configfs group.
 *
 *   ConfigNode            a path + the injected ConfigFS            (composition: holds `fs`)
 *   ├─ ConfigManager      a directory of child nodes: list/get/create/delete
 *   └─ AttributeController a directory of attribute files, described by a schema
 *
 * Models (TPG, LUN, ACL, ...) extend ConfigNode and *compose* their child
 * managers / attribute controllers as readonly properties.
 *
 * Rule of thumb used everywhere:
 *   - a scalar file      -> a method on the owning node      (tpg.enable())
 *   - a directory of attributes -> an AttributeController + a model interface
 *                                  (tpg.attrib : TPGAttribController, TPGAttrib)
 *   - a directory of child groups -> a ConfigManager         (tpg.lun : LUNManager)
 */

import { ConfigFS, LIOError } from "@/lib/configfs";

/* -------------------------------------------------------------------------- */
/* Nodes & managers                                                           */
/* -------------------------------------------------------------------------- */

abstract class ConfigNode {
  readonly fs: ConfigFS;
  readonly path: string;

  constructor(fs: ConfigFS, nodePath: string) {
    this.fs = fs;
    this.path = nodePath;
  }

  protected child(...segments: string[]): string {
    return this.fs.join(this.path, ...segments);
  }

  exists(): Promise<boolean> {
    return this.fs.exists(this.path);
  }
}

/**
 * A directory whose sub-directories are child nodes. Concrete managers keep
 * their own typed get/create/delete signatures (keys differ: number, string,
 * address, ...) and use the protected helpers for the actual I/O.
 */
abstract class ConfigManager<TNode extends ConfigNode> extends ConfigNode {
  abstract list(): Promise<TNode[]>;

  protected async childDirs(filter?: RegExp): Promise<string[]> {
    const names = await this.fs.dirs(this.path);
    return filter ? names.filter((n) => filter.test(n)) : names;
  }

  /** For children named `<prefix>_<number>` (lun_0, tpgt_1, iblock_3 ...), sorted numerically. */
  protected async childIndices(prefix: string): Promise<number[]> {
    const re = new RegExp(`^${prefix}_(\\d+)$`);
    return (await this.fs.dirs(this.path))
      .map((n) => re.exec(n))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
  }

  protected hasChild(name: string): Promise<boolean> {
    return this.fs.exists(this.child(name));
  }

  protected makeChild(name: string): Promise<void> {
    return this.fs.mkdir(this.child(name));
  }

  protected removeChild(name: string): Promise<void> {
    return this.fs.rmdir(this.child(name));
  }
}

/* -------------------------------------------------------------------------- */
/* Attribute codecs & schema                                                  */
/* -------------------------------------------------------------------------- */

interface Codec<T> {
  decode(raw: string): T;
  encode(value: T): string;
}

interface AttrSpec<T> {
  codec: Codec<T>;
  /** Rejected client-side with a clear error instead of an EPERM from the kernel. */
  readOnly?: boolean;
}

/** One AttrSpec per key of the model: the compiler enforces schema and model stay in sync. */
type AttrSchema<TModel> = { [K in keyof TModel]-?: AttrSpec<TModel[K]> };

interface AttrOptions {
  readOnly?: boolean;
}

const boolCodec: Codec<boolean> = {
  decode: (raw) => raw === "1",
  encode: (v) => (v ? "1" : "0"),
};

const intCodec: Codec<number> = {
  decode: (raw) => {
    const n = Number(raw);
    if (raw === "" || Number.isNaN(n))
      throw new LIOError(`Expected a number, got "${raw}"`);
    return n;
  },
  encode: (v) => {
    if (!Number.isInteger(v))
      throw new LIOError(`Expected an integer, got ${v}`);
    return String(v);
  },
};

const strCodec: Codec<string> = {
  decode: (raw) => raw,
  encode: (v) => v,
};

/** iSCSI login parameters use Yes/No. */
const yesNoCodec: Codec<boolean> = {
  decode: (raw) => raw.toLowerCase() === "yes",
  encode: (v) => (v ? "Yes" : "No"),
};

/** Spec constructors used to declare schemas. */
const attr = {
  bool: (o: AttrOptions = {}): AttrSpec<boolean> => ({
    codec: boolCodec,
    ...o,
  }),
  int: (o: AttrOptions = {}): AttrSpec<number> => ({ codec: intCodec, ...o }),
  str: (o: AttrOptions = {}): AttrSpec<string> => ({ codec: strCodec, ...o }),
  yesNo: (o: AttrOptions = {}): AttrSpec<boolean> => ({
    codec: yesNoCodec,
    ...o,
  }),
  custom: <T>(codec: Codec<T>, o: AttrOptions = {}): AttrSpec<T> => ({
    codec,
    ...o,
  }),
};

/* -------------------------------------------------------------------------- */
/* AttributeController                                                        */
/* -------------------------------------------------------------------------- */

/** A raw attribute value as it appears in a saved configuration file. */
type RawValue = string | number;

interface DumpOptions {
  /** Emit integer-looking values as numbers (the style of saveconfig.json "attributes"). */
  numeric?: boolean;
  /** Omit attributes whose value is empty (unset CHAP credentials, empty aliases). */
  skipEmpty?: boolean;
}

function toRaw(value: unknown): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  throw new LIOError(`Unsupported attribute value ${JSON.stringify(value)}`);
}

/**
 * Typed access to a directory of attribute files (attrib/, param/, auth/, wwn/, ...).
 * Subclasses only supply the schema; the model interface gives callers typed
 * keys and values.
 */
abstract class AttributeController<TModel extends object> extends ConfigNode {
  protected abstract readonly schema: AttrSchema<TModel>;

  keys(): (keyof TModel)[] {
    return Object.keys(this.schema) as (keyof TModel)[];
  }

  async get<K extends keyof TModel>(key: K): Promise<TModel[K]> {
    const raw = await this.fs.read(this.child(String(key)));
    return this.spec(key).codec.decode(raw);
  }

  async set<K extends keyof TModel>(key: K, value: TModel[K]): Promise<void> {
    const spec = this.spec(key);
    if (spec.readOnly)
      throw new LIOError(`Attribute "${String(key)}" is read-only`, {
        code: "EPERM",
      });
    await this.fs.write(this.child(String(key)), spec.codec.encode(value));
  }

  /**
   * Snapshot of every attribute of the model. Attributes missing on this kernel
   * are simply absent, hence Partial.
   */
  async read(): Promise<Partial<TModel>> {
    const out: Partial<Record<keyof TModel, unknown>> = {};
    await Promise.all(
      this.keys().map(async (key) => {
        const raw = await this.fs.readOptional(this.child(String(key)));
        if (raw !== null) out[key] = this.spec(key).codec.decode(raw);
      }),
    );
    return out as Partial<TModel>;
  }

  /** Writes only the given keys, in the order given. */
  async update(values: Partial<TModel>): Promise<void> {
    for (const key of Object.keys(values) as (keyof TModel)[]) {
      const value = values[key];
      if (value !== undefined) await this.set(key, value as TModel[typeof key]);
    }
  }

  /**
   * Raw snapshot of every *writable* attribute that exists on this kernel,
   * keyed by file name. This is what a saved configuration stores: read-only
   * attributes describe the hardware/kernel, not the configuration.
   */
  async dump(options: DumpOptions = {}): Promise<Record<string, RawValue>> {
    const keys = this.keys().filter((k) => !this.spec(k).readOnly);
    const raws = await Promise.all(
      keys.map((k) => this.fs.readOptional(this.child(String(k)))),
    );
    const out: Record<string, RawValue> = {};
    keys.forEach((key, i) => {
      const raw = raws[i];
      if (raw === null || raw === undefined) return;
      if (raw === "" && options.skipEmpty) return;
      out[String(key)] =
        options.numeric && /^-?\d+$/.test(raw) ? Number(raw) : raw;
    });
    return out;
  }

  /**
   * Writes raw values (as produced by dump(), or read from a saved file) in the
   * order given. Booleans become 1/0. Unknown attributes are reported (newer
   * kernels), read-only ones are skipped. With `onError`, a failing attribute
   * is reported and the rest are still applied; without it the first error throws.
   */
  async restore(
    values: Record<string, unknown>,
    onError?: (key: string, error: unknown) => void,
  ): Promise<void> {
    const specs = this.schema as unknown as Record<
      string,
      AttrSpec<unknown> | undefined
    >;
    for (const [key, value] of Object.entries(values)) {
      try {
        const spec = Object.hasOwn(specs, key) ? specs[key] : undefined;
        if (!spec) throw new LIOError(`Unknown attribute "${key}"`);
        if (spec.readOnly || value === undefined || value === null) continue;
        await this.fs.write(this.child(key), toRaw(value));
      } catch (e) {
        if (!onError) throw e;
        onError(key, e);
      }
    }
  }

  /** Escape hatch for attributes the schema does not know about (newer/older kernels). */
  getRaw(name: string): Promise<string> {
    assertSegment(name, "attribute name");
    return this.fs.read(this.child(name));
  }

  setRaw(name: string, value: string): Promise<void> {
    assertSegment(name, "attribute name");
    return this.fs.write(this.child(name), value);
  }

  private spec<K extends keyof TModel>(key: K): AttrSpec<TModel[K]> {
    const spec = this.schema[key] as AttrSpec<TModel[K]> | undefined;
    if (!spec) throw new LIOError(`Unknown attribute "${String(key)}"`);
    return spec;
  }
}

/* -------------------------------------------------------------------------- */
/* Validation helpers                                                         */
/* -------------------------------------------------------------------------- */

function assertIdent(value: string, what: string): void {
  if (!/^[A-Za-z0-9_.:\-]+$/.test(value)) {
    throw new LIOError(
      `Invalid ${what} "${value}" (allowed: letters, digits, _ . : -)`,
    );
  }
}

function assertSegment(value: string, what: string): void {
  if (!/^\w+$/.test(value)) throw new LIOError(`Invalid ${what} "${value}"`);
}

/** Values placed in the `control` file are comma/newline separated. */
function assertControlValue(value: string, what: string): void {
  if (/[,\n\0]/.test(value))
    throw new LIOError(`${what} must not contain commas or newlines`);
}

export {
  ConfigNode,
  ConfigManager,
  attr,
  AttributeController,
  assertIdent,
  assertSegment,
  assertControlValue,
};

export type { Codec, AttrSpec, AttrSchema, AttrOptions, RawValue, DumpOptions };

/**
 * Turns untrusted JSON (a saveconfig.json from disk) into a SavedConfig, with
 * errors that name the offending path. Tolerant where rtslib-fb is: booleans
 * may be 0/1 or "0"/"1", numbers may be numeric strings, missing lists are empty.
 */

import { LIOError } from "@/lib/configfs";
import type {
  AttrValue,
  SavedAcl,
  SavedAluaGroup,
  SavedAttrs,
  SavedConfig,
  SavedFabricModule,
  SavedLun,
  SavedMappedLun,
  SavedPortal,
  SavedStorageObject,
  SavedStorageObjectBase,
  SavedTarget,
  SavedTpg,
} from "@/config/types";

type Obj = Record<string, unknown>;

function fail(at: string, message: string): never {
  throw new LIOError(`Invalid configuration: ${at} ${message}`);
}

function rec(v: unknown, at: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    fail(at, "must be an object");
  return v as Obj;
}

function list(v: unknown, at: string): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(at, "must be an array");
  return v;
}

function str(o: Obj, key: string, at: string): string {
  const v = o[key];
  if (typeof v !== "string" || v === "") fail(`${at}.${key}`, "must be a non-empty string");
  return v;
}

function optStr(o: Obj, key: string, at: string): string | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") fail(`${at}.${key}`, "must be a string");
  return v;
}

function toInt(v: unknown): number | undefined {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) ? n : undefined;
}

function int(o: Obj, key: string, at: string): number {
  const n = toInt(o[key]);
  if (n === undefined) fail(`${at}.${key}`, "must be an integer");
  return n;
}

function optInt(o: Obj, key: string, at: string): number | undefined {
  return o[key] === undefined || o[key] === null ? undefined : int(o, key, at);
}

function optBool(o: Obj, key: string, at: string): boolean | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (v === true || v === 1 || v === "1") return true;
  if (v === false || v === 0 || v === "0") return false;
  return fail(`${at}.${key}`, "must be a boolean (true/false/0/1)");
}

function attrs(o: Obj, key: string, at: string): SavedAttrs | undefined {
  if (o[key] === undefined || o[key] === null) return undefined;
  const source = rec(o[key], `${at}.${key}`);
  const out: SavedAttrs = {};
  for (const [k, v] of Object.entries(source)) {
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean")
      fail(`${at}.${key}.${k}`, "must be a string, number or boolean");
    out[k] = v;
  }
  return out;
}

/** Copies the optional keys that are present, dropping undefined ones. */
function defined<T extends object>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as T;
}

function chap(o: Obj, at: string) {
  return {
    chap_userid: optStr(o, "chap_userid", at),
    chap_password: optStr(o, "chap_password", at),
    chap_mutual_userid: optStr(o, "chap_mutual_userid", at),
    chap_mutual_password: optStr(o, "chap_mutual_password", at),
  };
}

/* ----- storage objects ----- */

function aluaGroup(v: unknown, at: string): SavedAluaGroup {
  const o = rec(v, at);
  const out: SavedAluaGroup = { name: str(o, "name", at) };
  for (const [k, value] of Object.entries(o)) {
    if (k === "name") continue;
    if (k === "tg_pt_gp_id") {
      out.tg_pt_gp_id = int(o, k, at);
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[k] = value as AttrValue;
    } else fail(`${at}.${k}`, "must be a string, number or boolean");
  }
  return out;
}

function storageObject(v: unknown, at: string): SavedStorageObject {
  const o = rec(v, at);
  const base: SavedStorageObjectBase = defined({
    name: str(o, "name", at),
    wwn: optStr(o, "wwn", at),
    attributes: attrs(o, "attributes", at),
    alua_tpgs: list(o["alua_tpgs"], `${at}.alua_tpgs`).map((g, i) =>
      aluaGroup(g, `${at}.alua_tpgs[${i}]`),
    ),
  });
  const plugin = str(o, "plugin", at);
  switch (plugin) {
    case "block":
      return defined({
        ...base,
        plugin,
        dev: str(o, "dev", at),
        readonly: optBool(o, "readonly", at),
      });
    case "fileio":
      return defined({
        ...base,
        plugin,
        dev: str(o, "dev", at),
        size: optInt(o, "size", at),
        write_back: optBool(o, "write_back", at),
      });
    case "ramdisk":
      return defined({
        ...base,
        plugin,
        size: int(o, "size", at),
        nullio: optBool(o, "nullio", at),
      });
    case "user":
      return defined({
        ...base,
        plugin,
        config: str(o, "config", at),
        size: int(o, "size", at),
        hw_max_sectors: optInt(o, "hw_max_sectors", at),
      });
    default:
      return fail(`${at}.plugin`, `"${plugin}" is not supported (block, fileio, ramdisk, user)`);
  }
}

/* ----- targets ----- */

function lun(v: unknown, at: string): SavedLun {
  const o = rec(v, at);
  return defined({
    index: int(o, "index", at),
    storage_object: str(o, "storage_object", at),
    alias: optStr(o, "alias", at),
    alua_tg_pt_gp_name: optStr(o, "alua_tg_pt_gp_name", at),
  });
}

function mappedLun(v: unknown, at: string): SavedMappedLun {
  const o = rec(v, at);
  return defined({
    index: int(o, "index", at),
    tpg_lun: int(o, "tpg_lun", at),
    write_protect: optBool(o, "write_protect", at),
  });
}

function acl(v: unknown, at: string): SavedAcl {
  const o = rec(v, at);
  return defined({
    node_wwn: str(o, "node_wwn", at),
    attributes: attrs(o, "attributes", at),
    mapped_luns: list(o["mapped_luns"], `${at}.mapped_luns`).map((m, i) =>
      mappedLun(m, `${at}.mapped_luns[${i}]`),
    ),
    tag: optStr(o, "tag", at),
    tcq_depth: optInt(o, "tcq_depth", at),
    ...chap(o, at),
  });
}

function portal(v: unknown, at: string): SavedPortal {
  const o = rec(v, at);
  const ip = str(o, "ip_address", at);
  return defined({
    ip_address: ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip,
    port: o["port"] === undefined ? 3260 : int(o, "port", at),
    iser: optBool(o, "iser", at),
    offload: optBool(o, "offload", at),
  });
}

function tpg(v: unknown, at: string): SavedTpg {
  const o = rec(v, at);
  const tag = int(o, "tag", at);
  if (tag < 1) fail(`${at}.tag`, "must be >= 1");
  return defined({
    tag,
    enable: optBool(o, "enable", at),
    attributes: attrs(o, "attributes", at),
    parameters: attrs(o, "parameters", at),
    luns: list(o["luns"], `${at}.luns`).map((l, i) => lun(l, `${at}.luns[${i}]`)),
    node_acls: list(o["node_acls"], `${at}.node_acls`).map((a, i) =>
      acl(a, `${at}.node_acls[${i}]`),
    ),
    portals: list(o["portals"], `${at}.portals`).map((p, i) =>
      portal(p, `${at}.portals[${i}]`),
    ),
    ...chap(o, at),
  });
}

function target(v: unknown, at: string): SavedTarget {
  const o = rec(v, at);
  const fabric = str(o, "fabric", at);
  if (fabric !== "iscsi")
    fail(`${at}.fabric`, `"${fabric}" is not supported (only iscsi)`);
  return {
    fabric,
    wwn: str(o, "wwn", at),
    tpgs: list(o["tpgs"], `${at}.tpgs`).map((t, i) => tpg(t, `${at}.tpgs[${i}]`)),
  };
}

function fabricModule(v: unknown, at: string): SavedFabricModule {
  const o = rec(v, at);
  const enable = optBool(o, "discovery_enable_auth", at);
  return defined({
    name: str(o, "name", at),
    discovery_enable_auth: enable === undefined ? undefined : Number(enable),
    discovery_userid: optStr(o, "discovery_userid", at),
    discovery_password: optStr(o, "discovery_password", at),
    discovery_mutual_userid: optStr(o, "discovery_mutual_userid", at),
    discovery_mutual_password: optStr(o, "discovery_mutual_password", at),
  });
}

/** Validates and normalizes parsed JSON. Throws LIOError naming the bad path. */
export function parseSavedConfig(input: unknown): SavedConfig {
  const root = rec(input, "config");
  return {
    fabric_modules: list(root["fabric_modules"], "fabric_modules").map((m, i) =>
      fabricModule(m, `fabric_modules[${i}]`),
    ),
    storage_objects: list(root["storage_objects"], "storage_objects").map(
      (s, i) => storageObject(s, `storage_objects[${i}]`),
    ),
    targets: list(root["targets"], "targets").map((t, i) =>
      target(t, `targets[${i}]`),
    ),
  };
}

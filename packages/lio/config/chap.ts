/**
 * CHAP credentials appear under different key names in a saved configuration
 * depending on where they live (TPG/ACL: chap_*, discovery: discovery_*).
 */

import { CHAP_FIELDS } from "@/iscsi/auth";
import type { ChapCredentials, ChapField } from "@/iscsi/auth";
import type { RawValue } from "@/lib/base";

type ChapKeyMap = Record<ChapField, string>;

const CHAP_KEYS: ChapKeyMap = {
  userid: "chap_userid",
  password: "chap_password",
  userid_mutual: "chap_mutual_userid",
  password_mutual: "chap_mutual_password",
};

const DISCOVERY_CHAP_KEYS: ChapKeyMap = {
  userid: "discovery_userid",
  password: "discovery_password",
  userid_mutual: "discovery_mutual_userid",
  password_mutual: "discovery_mutual_password",
};

/** Non-empty credentials from a raw auth dump, under their saved-file names. */
function chapToSaved(
  raw: Record<string, RawValue>,
  keys: ChapKeyMap,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of CHAP_FIELDS) {
    const value = raw[field];
    if (value !== undefined && value !== "") out[keys[field]] = String(value);
  }
  return out;
}

/** Credentials found in a saved object, ready for setCredentials(). */
function chapFromSaved(saved: object, keys: ChapKeyMap): ChapCredentials {
  const source = saved as Record<string, unknown>;
  const out: ChapCredentials = {};
  for (const field of CHAP_FIELDS) {
    const value = source[keys[field]];
    if (typeof value === "string" && value !== "") out[field] = value;
  }
  return out;
}

export type { ChapKeyMap };
export { CHAP_KEYS, DISCOVERY_CHAP_KEYS, chapToSaved, chapFromSaved };

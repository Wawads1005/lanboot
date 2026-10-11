import crypto from "node:crypto";
import os from "node:os";
import { LIOError } from "@/lib/configfs";

const WWN_RE =
  /^(iqn\.\d{4}-\d{2}\.[a-z0-9.\-]+(:[^\s/]+)?|eui\.[0-9a-f]{16}|naa\.[0-9a-f]{16,32})$/;

/** Validates an iqn./eui./naa. name and lowercases it (the kernel expects lowercase). */
function normalizeWwn(wwn: string): string {
  const w = wwn.trim().toLowerCase();
  if (!WWN_RE.test(w)) throw new LIOError(`Invalid iSCSI WWN "${wwn}"`);
  return w;
}

function defaultIqn(): string {
  const host =
    os
      .hostname()
      .toLowerCase()
      .replace(/[^a-z0-9.\-]/g, "-") || "localhost";
  return `iqn.2003-01.org.linux-iscsi.${host}:sn.${crypto.randomBytes(6).toString("hex")}`;
}

export { WWN_RE, normalizeWwn, defaultIqn };

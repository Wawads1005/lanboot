/**
 * iscsi/<iqn>/tpgt_N/acls/<initiator>/info   -> the session of that initiator
 *
 *   SessionManager      (tpg.session / target.session / lio.iscsi.session)
 *   └─ Session          one logged-in initiator, parsed from the ACL's `info`
 *        └─ connections : SessionConnection[]
 *
 * The kernel keeps no session directory of its own; an ACL's `info` file either
 * says "No active iSCSI Session ..." or describes the session and its
 * connections. A session is a read-only snapshot: call refresh() to update it.
 */

import { ConfigManager, ConfigNode } from "@/lib/base";
import type { ConfigFS } from "@/lib/configfs";
import type { ACL } from "@/iscsi/acl";

interface SessionConnection {
  cid: number;
  /** e.g. "LOGGED_IN" (TARG_CONN_STATE_ prefix stripped). */
  state: string;
  /** Initiator-facing address of the connection, when reported. */
  address?: string;
  /** "TCP" or "SCTP" (iSER shows as TCP/IB depending on kernel). */
  transport?: string;
}

interface SessionInfo {
  /** Initiator IQN. */
  initiator: string;
  alias: string;
  /** LIO session id. */
  id: number;
  /** Initiator session id, hex without separators (e.g. "0x00023d000001"). */
  isid: string;
  tsih: number;
  /** "Normal" or "Discovery". */
  type: string;
  /** e.g. "LOGGED_IN" (TARG_SESS_STATE_ prefix stripped). */
  state: string;
  connections: SessionConnection[];
}

/** Parses the text of an ACL `info` file; null when there is no active session. */
function parseSessionInfo(
  text: string,
  fallbackInitiator = "",
): SessionInfo | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0 || /^No active iSCSI Session/i.test(lines[0]!))
    return null;

  const info: SessionInfo = {
    initiator: fallbackInitiator,
    alias: "",
    id: -1,
    isid: "",
    tsih: 0,
    type: "Normal",
    state: "UNKNOWN",
    connections: [],
  };
  let sawSession = false;

  for (const line of lines) {
    let m: RegExpExecArray | null;
    if ((m = /^InitiatorName:\s*(.*)$/.exec(line))) {
      info.initiator = m[1]!.trim() || fallbackInitiator;
    } else if ((m = /^InitiatorAlias:\s*(.*)$/.exec(line))) {
      info.alias = m[1]!.trim();
    } else if ((m = /^LIO Session ID:\s*(\d+)/.exec(line))) {
      sawSession = true;
      info.id = Number(m[1]);
      const isid = /ISID:\s*(.+?)\s+TSIH:/.exec(line);
      if (isid) info.isid = isid[1]!.replace(/\s+/g, "");
      const tsih = /TSIH:\s*(\d+)/.exec(line);
      if (tsih) info.tsih = Number(tsih[1]);
      const type = /SessionType:\s*(\w+)/.exec(line);
      if (type) info.type = type[1]!;
    } else if (
      (m = /^Session State:\s*(?:TARG_SESS_STATE_)?(\w+)/.exec(line))
    ) {
      info.state = m[1]!;
    } else if (
      (m =
        /^CID:\s*(\d+)\s+Connection State:\s*(?:TARG_CONN_STATE_)?(\w+)/.exec(
          line,
        ))
    ) {
      info.connections.push({ cid: Number(m[1]), state: m[2]! });
    }

    // "Address 10.0.0.5 TCP  StatSN: ..." sits on its own line or after the state.
    const address = /\bAddress\s+(\S+)\s+(TCP|SCTP|\w+)/.exec(line);
    const last = info.connections.at(-1);
    if (address && last) {
      last.address = address[1]!;
      last.transport = address[2]!;
    }
  }

  return sawSession ? info : null;
}

class Session extends ConfigNode {
  readonly tpgPath: string;
  readonly info: SessionInfo;

  /** `path` is the ACL directory the session belongs to. */
  constructor(
    fs: ConfigFS,
    aclPath: string,
    tpgPath: string,
    info: SessionInfo,
  ) {
    super(fs, aclPath);
    this.tpgPath = tpgPath;
    this.info = info;
  }

  /** Reads the ACL's info file; null if the initiator has no session. */
  static async read(
    fs: ConfigFS,
    aclPath: string,
    tpgPath: string,
    initiator: string,
  ): Promise<Session | null> {
    const text = await fs.readOptional(fs.join(aclPath, "info"));
    const info = text ? parseSessionInfo(text, initiator) : null;
    return info ? new Session(fs, aclPath, tpgPath, info) : null;
  }

  get id(): number {
    return this.info.id;
  }

  get initiator(): string {
    return this.info.initiator;
  }

  get alias(): string {
    return this.info.alias;
  }

  get state(): string {
    return this.info.state;
  }

  get type(): string {
    return this.info.type;
  }

  get connections(): SessionConnection[] {
    return this.info.connections;
  }

  get isLoggedIn(): boolean {
    return this.info.state === "LOGGED_IN";
  }

  /** IQN of the target the session is on. */
  get target(): string {
    return this.tpgPath.split("/").at(-2) ?? "";
  }

  /** Portal group tag (the N of tpgt_N). */
  get tpgTag(): number {
    return Number(/tpgt_(\d+)$/.exec(this.tpgPath)?.[1] ?? 0);
  }

  /** A fresh snapshot; null once the initiator has logged out. */
  refresh(): Promise<Session | null> {
    return Session.read(this.fs, this.path, this.tpgPath, this.initiator);
  }
}

/**
 * Sessions of everything below some scope. The scope is given as a function
 * returning the ACLs to inspect, so the same manager serves a TPG, a target
 * and the whole iSCSI fabric.
 */
class SessionManager extends ConfigManager<Session> {
  private readonly acls: () => Promise<ACL[]>;

  constructor(fs: ConfigFS, scopePath: string, acls: () => Promise<ACL[]>) {
    super(fs, scopePath);
    this.acls = acls;
  }

  async list(): Promise<Session[]> {
    const sessions = await Promise.all(
      (await this.acls()).map((acl) => acl.session()),
    );
    return sessions.filter((s): s is Session => s !== null);
  }

  /** By LIO session id (unique per target). */
  async get(id: number): Promise<Session | null> {
    return (await this.list()).find((s) => s.id === id) ?? null;
  }

  async getByInitiator(initiator: string): Promise<Session | null> {
    const wanted = initiator.trim().toLowerCase();
    return (
      (await this.list()).find((s) => s.initiator.toLowerCase() === wanted) ??
      null
    );
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }
}

export { parseSessionInfo, Session, SessionManager };
export type { SessionConnection, SessionInfo };

/**
 * iscsi/<iqn>/tpgt_N/
 *   TPG
 *   ├─ attrib  : TPGAttribController   (model: TPGAttrib)
 *   ├─ param   : TPGParamController    (model: TPGParam)
 *   ├─ auth    : TPGAuthController     (model: TPGAuth)
 *   ├─ lun     : LUNManager
 *   ├─ acl     : ACLManager
 *   ├─ portal  : PortalManager
 *   └─ session : SessionManager        (sessions of every ACL of this TPG)
 */

import {
  AttributeController,
  ConfigManager,
  ConfigNode,
  attr,
  type AttrSchema,
} from "@/lib/base";
import { LIOError } from "@/lib/configfs";
import type { ConfigFS } from "@/lib/configfs";
import { ACLManager } from "@/iscsi/acl";
import { TPGAuthController } from "@/iscsi/auth";
import { LUNManager } from "@/iscsi/lun";
import { PortalManager } from "@/iscsi/portal";
import { SessionManager } from "@/iscsi/session";

/* -------------------------------------------------------------------------- */
/* attrib/                                                                    */
/* -------------------------------------------------------------------------- */

interface TPGAttrib {
  authentication: boolean;
  cache_dynamic_acls: boolean;
  default_cmdsn_depth: number;
  default_erl: number;
  demo_mode_discovery: boolean;
  demo_mode_write_protect: boolean;
  fabric_prot_type: number;
  generate_node_acls: boolean;
  login_keys_workaround: boolean;
  login_timeout: number;
  netif_timeout: number;
  prod_mode_write_protect: boolean;
  t10_pi: boolean;
  tpg_enabled_sendtargets: boolean;
}

const TPG_ATTRIB: AttrSchema<TPGAttrib> = {
  authentication: attr.bool(),
  cache_dynamic_acls: attr.bool(),
  default_cmdsn_depth: attr.int(),
  default_erl: attr.int(),
  demo_mode_discovery: attr.bool(),
  demo_mode_write_protect: attr.bool(),
  fabric_prot_type: attr.int(),
  generate_node_acls: attr.bool(),
  login_keys_workaround: attr.bool(),
  login_timeout: attr.int(),
  netif_timeout: attr.int(),
  prod_mode_write_protect: attr.bool(),
  t10_pi: attr.bool(),
  tpg_enabled_sendtargets: attr.bool(),
};

class TPGAttribController extends AttributeController<TPGAttrib> {
  protected readonly schema = TPG_ATTRIB;
}

/* -------------------------------------------------------------------------- */
/* param/  (iSCSI login parameters)                                           */
/* -------------------------------------------------------------------------- */

interface TPGParam {
  AuthMethod: string;
  DataDigest: string;
  DataPDUInOrder: boolean;
  DataSequenceInOrder: boolean;
  DefaultTime2Retain: number;
  DefaultTime2Wait: number;
  ErrorRecoveryLevel: number;
  FirstBurstLength: number;
  HeaderDigest: string;
  IFMarker: boolean;
  IFMarkInt: string;
  ImmediateData: boolean;
  InitialR2T: boolean;
  MaxBurstLength: number;
  MaxConnections: number;
  MaxOutstandingR2T: number;
  MaxRecvDataSegmentLength: number;
  MaxXmitDataSegmentLength: number;
  OFMarker: boolean;
  OFMarkInt: string;
  TargetAlias: string;
}

const TPG_PARAM: AttrSchema<TPGParam> = {
  AuthMethod: attr.str(),
  DataDigest: attr.str(),
  DataPDUInOrder: attr.yesNo(),
  DataSequenceInOrder: attr.yesNo(),
  DefaultTime2Retain: attr.int(),
  DefaultTime2Wait: attr.int(),
  ErrorRecoveryLevel: attr.int(),
  FirstBurstLength: attr.int(),
  HeaderDigest: attr.str(),
  IFMarker: attr.yesNo(),
  IFMarkInt: attr.str(),
  ImmediateData: attr.yesNo(),
  InitialR2T: attr.yesNo(),
  MaxBurstLength: attr.int(),
  MaxConnections: attr.int(),
  MaxOutstandingR2T: attr.int(),
  MaxRecvDataSegmentLength: attr.int(),
  MaxXmitDataSegmentLength: attr.int(),
  OFMarker: attr.yesNo(),
  OFMarkInt: attr.str(),
  TargetAlias: attr.str(),
};

class TPGParamController extends AttributeController<TPGParam> {
  protected readonly schema = TPG_PARAM;
}

/* -------------------------------------------------------------------------- */
/* TPG                                                                        */
/* -------------------------------------------------------------------------- */

class TPG extends ConfigNode {
  readonly wwn: string;
  readonly tag: number;
  readonly attrib: TPGAttribController;
  readonly param: TPGParamController;
  readonly auth: TPGAuthController;
  readonly lun: LUNManager;
  readonly acl: ACLManager;
  readonly portal: PortalManager;
  readonly session: SessionManager;

  constructor(fs: ConfigFS, targetPath: string, wwn: string, tag: number) {
    super(fs, fs.join(targetPath, `tpgt_${tag}`));
    this.wwn = wwn;
    this.tag = tag;
    this.attrib = new TPGAttribController(fs, this.child("attrib"));
    this.param = new TPGParamController(fs, this.child("param"));
    this.auth = new TPGAuthController(fs, this.child("auth"));
    this.lun = new LUNManager(fs, this);
    this.acl = new ACLManager(fs, this.path);
    this.portal = new PortalManager(fs, this.path);
    this.session = new SessionManager(fs, this.path, () => this.acl.list());
  }

  async isEnabled(): Promise<boolean> {
    return (await this.fs.read(this.child("enable"))) === "1";
  }

  async enable(): Promise<void> {
    await this.fs.write(this.child("enable"), "1");
  }

  async disable(): Promise<void> {
    await this.fs.write(this.child("enable"), "0");
  }
}

class TPGManager extends ConfigManager<TPG> {
  private readonly wwn: string;

  constructor(fs: ConfigFS, targetPath: string, wwn: string) {
    super(fs, targetPath);
    this.wwn = wwn;
  }

  async list(): Promise<TPG[]> {
    return (await this.childIndices("tpgt")).map((t) => this.open(t));
  }

  async get(tag: number): Promise<TPG | null> {
    return (await this.hasChild(`tpgt_${tag}`)) ? this.open(tag) : null;
  }

  /** Like targetcli, a new TPG is enabled unless `enable: false` is given. */
  async create(tag: number, opts: { enable?: boolean } = {}): Promise<TPG> {
    if (!Number.isInteger(tag) || tag < 1)
      throw new LIOError(`Invalid TPG tag ${tag}`);
    await this.makeChild(`tpgt_${tag}`);
    const tpg = this.open(tag);
    if (opts.enable ?? true) {
      try {
        await tpg.enable();
      } catch (e) {
        await this.removeChild(`tpgt_${tag}`).catch(() => {});
        throw e;
      }
    }
    return tpg;
  }

  /** Disables the TPG, then removes ACLs, LUNs and portals, then the TPG itself. */
  async delete(target: number | TPG): Promise<void> {
    const tpg = typeof target === "number" ? await this.get(target) : target;
    if (!tpg)
      throw new LIOError(`TPG not found: ${String(target)}`, {
        code: "ENOENT",
      });

    await tpg.disable().catch(() => {});
    await tpg.acl.deleteAll();
    await tpg.lun.deleteAll();
    await tpg.portal.deleteAll();
    await this.removeChild(`tpgt_${tpg.tag}`);
  }

  async deleteAll(): Promise<void> {
    for (const tpg of await this.list()) await this.delete(tpg);
  }

  private open(tag: number): TPG {
    return new TPG(this.fs, this.path, this.wwn, tag);
  }
}

export {
  TPG_ATTRIB,
  TPGAttribController,
  TPG_PARAM,
  TPGParamController,
  TPG,
  TPGManager,
};

export type { TPGAttrib, TPGParam };

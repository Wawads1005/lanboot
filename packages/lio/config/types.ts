/**
 * Shape of the saved configuration (JSON). It follows rtslib-fb / targetcli's
 * `saveconfig.json`, so existing files can be restored and files written here
 * can be read by targetcli (for the object types both support).
 */

type AttrValue = string | number | boolean;
type SavedAttrs = Record<string, AttrValue>;

/** Plugin names as used in saveconfig.json (kernel names: iblock, fileio, rd_mcp, user). */
type StorageKind = "block" | "fileio" | "ramdisk" | "user";

/* ----- storage objects ----- */

/** ALUA target port group; attribute files are flattened next to `name`, like rtslib-fb. */
interface SavedAluaGroup {
  name: string;
  tg_pt_gp_id?: number;
  [attribute: string]: AttrValue | undefined;
}

interface SavedStorageObjectBase {
  name: string;
  /** T10 VPD unit serial. */
  wwn?: string;
  attributes?: SavedAttrs;
  alua_tpgs?: SavedAluaGroup[];
}

interface SavedBlockStorageObject extends SavedStorageObjectBase {
  plugin: "block";
  dev: string;
  readonly?: boolean;
}

interface SavedFileStorageObject extends SavedStorageObjectBase {
  plugin: "fileio";
  /** Backing file path. */
  dev: string;
  size?: number;
  write_back?: boolean;
}

interface SavedRamdiskStorageObject extends SavedStorageObjectBase {
  plugin: "ramdisk";
  size: number;
  nullio?: boolean;
}

interface SavedUserStorageObject extends SavedStorageObjectBase {
  plugin: "user";
  /** TCMU handler config, e.g. "file//var/lib/disk.img". */
  config: string;
  size: number;
  hw_max_sectors?: number;
}

type SavedStorageObject =
  | SavedBlockStorageObject
  | SavedFileStorageObject
  | SavedRamdiskStorageObject
  | SavedUserStorageObject;

/* ----- iSCSI fabric ----- */

interface SavedLun {
  index: number;
  /** "/backstores/<plugin>/<name>" */
  storage_object: string;
  /** Name of the symlink inside lun_N/. */
  alias?: string;
  alua_tg_pt_gp_name?: string;
}

interface SavedMappedLun {
  index: number;
  tpg_lun: number;
  write_protect?: boolean;
}

interface SavedChap {
  chap_userid?: string;
  chap_password?: string;
  chap_mutual_userid?: string;
  chap_mutual_password?: string;
}

interface SavedAcl extends SavedChap {
  node_wwn: string;
  attributes?: SavedAttrs;
  mapped_luns: SavedMappedLun[];
  tag?: string;
  /** cmdsn_depth */
  tcq_depth?: number;
}

interface SavedPortal {
  ip_address: string;
  port: number;
  iser?: boolean;
  offload?: boolean;
}

interface SavedTpg extends SavedChap {
  tag: number;
  enable?: boolean;
  attributes?: SavedAttrs;
  parameters?: SavedAttrs;
  luns: SavedLun[];
  node_acls: SavedAcl[];
  portals: SavedPortal[];
}

interface SavedTarget {
  fabric: "iscsi";
  wwn: string;
  tpgs: SavedTpg[];
}

interface SavedFabricModule {
  name: string;
  discovery_enable_auth?: number;
  discovery_userid?: string;
  discovery_password?: string;
  discovery_mutual_userid?: string;
  discovery_mutual_password?: string;
}

interface SavedConfig {
  fabric_modules: SavedFabricModule[];
  storage_objects: SavedStorageObject[];
  targets: SavedTarget[];
}

export type {
  AttrValue,
  SavedAttrs,
  StorageKind,
  SavedAluaGroup,
  SavedStorageObjectBase,
  SavedBlockStorageObject,
  SavedFileStorageObject,
  SavedRamdiskStorageObject,
  SavedUserStorageObject,
  SavedStorageObject,
  SavedLun,
  SavedMappedLun,
  SavedChap,
  SavedAcl,
  SavedPortal,
  SavedTpg,
  SavedTarget,
  SavedFabricModule,
  SavedConfig,
};

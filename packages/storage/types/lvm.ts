interface PV {
  pv_name: string;
  vg_name: string;
  pv_fmt: string;
  pv_attr: string;
  pv_size: string;
  pv_free: string;
}

interface VG {
  vg_name: string;
  pv_count: number;
  lv_count: number;
  snap_count: number;
  vg_attr: string;
  vg_size: string;
  vg_free: string;
}

interface LV {
  lv_name: string;
  vg_name: string;
  lv_attr: string;
  lv_size: string;
  pool_lv: string;
  origin: string;
  data_percent: number | null;
  metadata_percent: number | null;
  move_pv: string;
  mirror_log: string;
  copy_percent: number | null;
  convert_lv: string;
}

type LVMVolume = "pv" | "vg" | "lv";

type LVMReport<T extends LVMVolume> = T extends "pv"
  ? { pv: PV[] }
  : T extends "vg"
    ? { vg: VG[] }
    : T extends "lv"
      ? { lv: LV[] }
      : never;

interface LVMResponse<T extends LVMVolume> {
  report: LVMReport<T>[];
}

export type { LVMResponse, LVMReport, LVMVolume, LV, PV, VG };

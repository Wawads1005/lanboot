/**
 * core/<plugin>_<hba>/<name>/pr/   persistent reservation state (read-only)
 *
 *   StorageObject
 *   └─ pr : StorageObjectPrController   (model: StorageObjectPr)
 */

import { AttributeController, attr } from "@/lib/base";
import type { AttrSchema } from "@/lib/base";

/** Free-form text as printed by the kernel; absent when the device has no PR support. */
interface StorageObjectPr {
  res_aptpl_active: string;
  res_holder: string;
  res_pr_all_tgt_pts: string;
  res_pr_generation: string;
  res_pr_registered_i_pts: string;
  res_pr_type: string;
  res_type: string;
}

const STORAGE_OBJECT_PR: AttrSchema<StorageObjectPr> = {
  res_aptpl_active: attr.str({ readOnly: true }),
  res_holder: attr.str({ readOnly: true }),
  res_pr_all_tgt_pts: attr.str({ readOnly: true }),
  res_pr_generation: attr.str({ readOnly: true }),
  res_pr_registered_i_pts: attr.str({ readOnly: true }),
  res_pr_type: attr.str({ readOnly: true }),
  res_type: attr.str({ readOnly: true }),
};

class StorageObjectPrController extends AttributeController<StorageObjectPr> {
  protected readonly schema = STORAGE_OBJECT_PR;
}

export type { StorageObjectPr };
export { STORAGE_OBJECT_PR, StorageObjectPrController };

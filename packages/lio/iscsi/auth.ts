/**
 * CHAP credential groups. The same five files appear in three places, so each
 * place gets its own model + controller (same pattern, distinct types):
 *
 *   iscsi/discovery_auth/            DiscoveryAuth  / DiscoveryAuthController
 *   iscsi/<iqn>/tpgt_N/auth/         TPGAuth        / TPGAuthController
 *   iscsi/<iqn>/tpgt_N/acls/<i>/auth/ ACLAuth       / ACLAuthController
 */

import { AttributeController, attr, type AttrSchema } from "@/lib/base";

interface ChapAuth {
  userid: string;
  password: string;
  userid_mutual: string;
  password_mutual: string;
  /** Read-only: reflects whether mutual authentication is configured. */
  authenticate_target: boolean;
}

const CHAP_AUTH: AttrSchema<ChapAuth> = {
  userid: attr.str(),
  password: attr.str(),
  userid_mutual: attr.str(),
  password_mutual: attr.str(),
  authenticate_target: attr.bool({ readOnly: true }),
};

/** The four writable credential files, in the order the kernel wants them set. */
const CHAP_FIELDS = [
  "userid",
  "password",
  "userid_mutual",
  "password_mutual",
] as const;

type ChapField = (typeof CHAP_FIELDS)[number];
type ChapCredentials = Partial<Record<ChapField, string>>;

/** Shared behaviour of the three CHAP groups. */
abstract class ChapAuthController<
  TModel extends ChapAuth,
> extends AttributeController<TModel> {
  /** Writes the given credentials one-way first, then mutual. */
  async setCredentials(credentials: ChapCredentials): Promise<void> {
    for (const field of CHAP_FIELDS) {
      const value = credentials[field];
      if (value !== undefined) await this.setRaw(field, value);
    }
  }

  /** Removes all credentials (the kernel treats the literal "NULL" as "unset"). */
  async clear(): Promise<void> {
    for (const field of CHAP_FIELDS) await this.setRaw(field, "NULL");
  }
}

/* ----- TPG ----- */

interface TPGAuth extends ChapAuth {}

class TPGAuthController extends ChapAuthController<TPGAuth> {
  protected readonly schema: AttrSchema<TPGAuth> = CHAP_AUTH;
}

/* ----- ACL ----- */

interface ACLAuth extends ChapAuth {}

class ACLAuthController extends ChapAuthController<ACLAuth> {
  protected readonly schema: AttrSchema<ACLAuth> = CHAP_AUTH;
}

/* ----- discovery ----- */

interface DiscoveryAuth extends ChapAuth {
  enforce_discovery_auth: boolean;
}

const DISCOVERY_AUTH: AttrSchema<DiscoveryAuth> = {
  ...CHAP_AUTH,
  enforce_discovery_auth: attr.bool(),
};

class DiscoveryAuthController extends ChapAuthController<DiscoveryAuth> {
  protected readonly schema = DISCOVERY_AUTH;
}

export {
  CHAP_AUTH,
  CHAP_FIELDS,
  ChapAuthController,
  TPGAuthController,
  ACLAuthController,
  DISCOVERY_AUTH,
  DiscoveryAuthController,
};

export type {
  ChapAuth,
  ChapField,
  ChapCredentials,
  TPGAuth,
  ACLAuth,
  DiscoveryAuth,
};

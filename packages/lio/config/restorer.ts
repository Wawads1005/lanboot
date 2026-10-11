/**
 * Applies a SavedConfig to the kernel, in dependency order:
 *
 *   discovery auth -> storage objects (+ attributes, ALUA) -> targets
 *     target -> TPG (disabled) -> attributes/params/CHAP -> LUNs -> ACLs
 *            (+ mapped LUNs) -> portals -> enable
 *
 * Like rtslib-fb, a failing object does not stop the restore: the error is
 * collected and the rest is still applied (set `abortOnError` to stop at the
 * first one). Existing targets/TPGs/ACLs/portals are reused, so restoring on
 * top of a running system merges instead of failing.
 */

import type { Backstores, StorageObject } from "@/core/backstore";
import { DEFAULT_ALUA_GROUP } from "@/core/alua";
import type { ConfigDeps } from "@/config/dumper";
import { LIOError } from "@/lib/configfs";
import type { TPG } from "@/iscsi/tpg";
import { normalizeWwn } from "@/lib/wwn";
import { CHAP_KEYS, DISCOVERY_CHAP_KEYS, chapFromSaved } from "@/config/chap";
import type { ChapCredentials } from "@/iscsi/auth";
import { parseSavedConfig } from "@/config/validate";
import type {
  SavedAcl,
  SavedAluaGroup,
  SavedFabricModule,
  SavedLun,
  SavedPortal,
  SavedStorageObject,
  SavedTarget,
  SavedTpg,
} from "@/config/types";
import type { iSCSIManager } from "@/iscsi/target";

interface RestoreOptions {
  /** Remove every existing target and storage object first. */
  clear?: boolean;
  /** Stop at the first error instead of collecting them. */
  abortOnError?: boolean;
  /** Only restore these targets (WWNs). With a filter, categories without one are skipped. */
  targets?: string[];
  /** Only restore these storage objects ("/backstores/block/disk0" or plain names). */
  storageObjects?: string[];
}

interface RestoreResult {
  /** One message per object or attribute that could not be applied. */
  errors: string[];
}

interface Run {
  errors: string[];
  abortOnError: boolean;
}

class ConfigRestorer {
  private readonly backstores: Backstores;
  private readonly iscsi: iSCSIManager;

  constructor({ backstores, iscsi }: ConfigDeps) {
    this.backstores = backstores;
    this.iscsi = iscsi;
  }

  /** Targets first (they hold LUN links), then storage objects. */
  async clear(): Promise<void> {
    if (await this.iscsi.isAvailable()) {
      await this.iscsi.deleteAll();
      await this.iscsi.discoveryAuth.clear();
      await this.iscsi.discoveryAuth.setRaw("enforce_discovery_auth", "0");
    }
    if (await this.backstores.isAvailable()) await this.backstores.deleteAll();
  }

  async restore(
    input: unknown,
    options: RestoreOptions = {},
  ): Promise<RestoreResult> {
    const config = parseSavedConfig(input);
    const run: Run = {
      errors: [],
      abortOnError: options.abortOnError ?? false,
    };

    if (options.clear) await this.clear();

    const onlyTargets = options.targets?.map((w) => normalizeWwn(w));
    const onlyObjects = options.storageObjects;

    if (!onlyTargets && !onlyObjects) {
      for (const module of config.fabric_modules)
        await this.guard(run, `fabric module ${module.name}`, () =>
          this.fabricModule(module),
        );
    }

    // A filter on one category means "only that": the other is skipped unless filtered too.
    const filtered = onlyTargets !== undefined || onlyObjects !== undefined;

    for (const saved of config.storage_objects) {
      if (filtered && !onlyObjects) break;
      if (onlyObjects && !this.wanted(saved, onlyObjects)) continue;
      await this.guard(
        run,
        `storage object ${saved.plugin}/${saved.name}`,
        () => this.storageObject(run, saved),
      );
    }

    for (const saved of config.targets) {
      if (filtered && !onlyTargets) break;
      if (onlyTargets && !onlyTargets.includes(normalizeWwn(saved.wwn)))
        continue;
      await this.guard(run, `target ${saved.wwn}`, () =>
        this.target(run, saved),
      );
    }

    return { errors: run.errors };
  }

  /* ----- helpers ----- */

  private wanted(saved: SavedStorageObject, filter: string[]): boolean {
    return filter.some(
      (f) =>
        f === saved.name || f === `/backstores/${saved.plugin}/${saved.name}`,
    );
  }

  private async guard(
    run: Run,
    label: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.report(run, label, e);
    }
  }

  private report(run: Run, label: string, error: unknown): void {
    const message = `${label}: ${error instanceof Error ? error.message : String(error)}`;
    if (run.abortOnError) throw new LIOError(message, { cause: error });
    run.errors.push(message);
  }

  /** Attribute failures are reported per attribute; the remaining ones still apply. */
  private attrErrors(run: Run, label: string) {
    return (key: string, error: unknown) =>
      this.report(run, `${label} attribute ${key}`, error);
  }

  private async applyChap(
    auth: { setCredentials(credentials: ChapCredentials): Promise<void> },
    saved: object,
    keys: typeof CHAP_KEYS,
  ): Promise<void> {
    const credentials = chapFromSaved(saved, keys);
    if (Object.keys(credentials).length > 0)
      await auth.setCredentials(credentials);
  }

  /* ----- fabric ----- */

  private async fabricModule(saved: SavedFabricModule): Promise<void> {
    if (saved.name !== "iscsi")
      throw new LIOError(`unsupported fabric module "${saved.name}"`);
    const auth = this.iscsi.discoveryAuth;
    await this.applyChap(auth, saved, DISCOVERY_CHAP_KEYS);
    if (saved.discovery_enable_auth !== undefined)
      await auth.setRaw(
        "enforce_discovery_auth",
        String(saved.discovery_enable_auth),
      );
  }

  /* ----- storage objects ----- */

  private async storageObject(
    run: Run,
    saved: SavedStorageObject,
  ): Promise<void> {
    const label = `storage object ${saved.plugin}/${saved.name}`;
    const so = await this.createStorageObject(saved);
    await so.attrib.restore(
      saved.attributes ?? {},
      this.attrErrors(run, label),
    );
    for (const group of saved.alua_tpgs ?? [])
      await this.guard(run, `${label} ALUA group ${group.name}`, () =>
        this.aluaGroup(run, so, group, label),
      );
  }

  private async createStorageObject(
    saved: SavedStorageObject,
  ): Promise<StorageObject> {
    switch (saved.plugin) {
      case "block":
        return this.backstores.block.create({
          name: saved.name,
          dev: saved.dev,
          readOnly: saved.readonly,
          wwn: saved.wwn,
        });
      case "fileio":
        return this.backstores.file.create({
          name: saved.name,
          file: saved.dev,
          size: saved.size,
          writeBack: saved.write_back,
          wwn: saved.wwn,
        });
      case "ramdisk":
        return this.backstores.ramdisk.create({
          name: saved.name,
          size: saved.size,
          nullio: saved.nullio,
          wwn: saved.wwn,
        });
      case "user":
        return this.backstores.user.create({
          name: saved.name,
          config: saved.config,
          size: saved.size,
          hwMaxSectors: saved.hw_max_sectors,
          wwn: saved.wwn,
        });
    }
  }

  private async aluaGroup(
    run: Run,
    so: StorageObject,
    saved: SavedAluaGroup,
    label: string,
  ): Promise<void> {
    const { name, tg_pt_gp_id, ...attributes } = saved;
    let group = await so.alua.get(name);
    if (!group) group = await so.alua.create(name, { id: tg_pt_gp_id });

    // The access state depends on the support flags, so it goes last.
    const { alua_access_state, ...rest } = attributes;
    const onError = this.attrErrors(run, `${label} ALUA group ${name}`);
    await group.attrib.restore(rest, onError);
    if (alua_access_state !== undefined)
      await group.attrib.restore({ alua_access_state }, onError);
  }

  /* ----- targets ----- */

  private async target(run: Run, saved: SavedTarget): Promise<void> {
    const target =
      (await this.iscsi.get({ wwn: saved.wwn })) ??
      (await this.iscsi.create({ wwn: saved.wwn }));
    for (const tpg of saved.tpgs)
      await this.guard(run, `TPG ${tpg.tag}`, () =>
        this.tpg(run, target.tpg, tpg, saved.wwn),
      );
  }

  private async tpg(
    run: Run,
    manager: {
      get(tag: number): Promise<TPG | null>;
      create(tag: number, o: { enable: boolean }): Promise<TPG>;
    },
    saved: SavedTpg,
    wwn: string,
  ): Promise<void> {
    const label = `${wwn} TPG ${saved.tag}`;
    const tpg =
      (await manager.get(saved.tag)) ??
      (await manager.create(saved.tag, { enable: false }));

    await tpg.attrib.restore(
      saved.attributes ?? {},
      this.attrErrors(run, `${label} attrib`),
    );
    await tpg.param.restore(
      saved.parameters ?? {},
      this.attrErrors(run, `${label} param`),
    );
    await this.guard(run, `${label} CHAP`, () =>
      this.applyChap(tpg.auth, saved, CHAP_KEYS),
    );

    for (const lun of saved.luns)
      await this.guard(run, `${label} LUN ${lun.index}`, () =>
        this.lun(tpg, lun),
      );
    for (const acl of saved.node_acls)
      await this.guard(run, `${label} ACL ${acl.node_wwn}`, () =>
        this.acl(run, tpg, acl, `${label} ACL ${acl.node_wwn}`),
      );
    for (const portal of saved.portals)
      await this.guard(
        run,
        `${label} portal ${portal.ip_address}:${portal.port}`,
        () => this.portal(tpg, portal),
      );

    // Enable last, so initiators never see a half-configured target.
    await this.guard(run, `${label} enable`, async () => {
      if (saved.enable ?? true) await tpg.enable();
      else await tpg.disable();
    });
  }

  private async lun(tpg: TPG, saved: SavedLun): Promise<void> {
    const so = await this.backstores.get(saved.storage_object);
    if (!so)
      throw new LIOError(`storage object ${saved.storage_object} not found`);

    const existing = await tpg.lun.get(saved.index);
    if (existing) {
      if ((await existing.storageObjectPath()) === so.path) return;
      throw new LIOError("already exports a different storage object");
    }

    const lun = await tpg.lun.create(saved.index, so, { alias: saved.alias });
    const group = saved.alua_tg_pt_gp_name;
    if (group && group !== DEFAULT_ALUA_GROUP) await lun.setAluaGroup(group);
  }

  private async acl(
    run: Run,
    tpg: TPG,
    saved: SavedAcl,
    label: string,
  ): Promise<void> {
    const acl =
      (await tpg.acl.get(saved.node_wwn)) ??
      (await tpg.acl.create(saved.node_wwn));

    await acl.attrib.restore(
      saved.attributes ?? {},
      this.attrErrors(run, `${label} attrib`),
    );
    await this.guard(run, `${label} CHAP`, () =>
      this.applyChap(acl.auth, saved, CHAP_KEYS),
    );
    if (saved.tag)
      await this.guard(run, `${label} tag`, () => acl.setTag(saved.tag!));
    if (saved.tcq_depth !== undefined)
      await this.guard(run, `${label} cmdsn_depth`, () =>
        acl.setCmdsnDepth(saved.tcq_depth!),
      );

    for (const m of saved.mapped_luns) {
      await this.guard(run, `${label} mapped LUN ${m.index}`, async () => {
        const existing = await acl.mappedLun.get(m.index);
        if (existing) {
          if ((await existing.lun()) !== m.tpg_lun)
            throw new LIOError(`already maps TPG LUN ${await existing.lun()}`);
          if (m.write_protect !== undefined)
            await existing.attrib.set("write_protect", m.write_protect);
          return;
        }
        await acl.mappedLun.create(m.index, m.tpg_lun, {
          writeProtect: m.write_protect,
        });
      });
    }
  }

  private async portal(tpg: TPG, saved: SavedPortal): Promise<void> {
    const address = { ip: saved.ip_address, port: saved.port };
    const portal =
      (await tpg.portal.get(address)) ??
      (await tpg.portal.create({
        ...address,
        iser: saved.iser,
        offload: saved.offload,
      }));
    // An already existing portal still gets the requested transport flags.
    if (saved.iser && !(await portal.iser())) await portal.setIser(true);
    if (saved.offload && !(await portal.offload()))
      await portal.setOffload(true);
  }
}

export type { RestoreOptions, RestoreResult, Run };
export { ConfigRestorer };

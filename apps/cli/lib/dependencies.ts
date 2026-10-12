import fsPromises from "node:fs/promises";
import path from "node:path";
import type { ConfigInput } from "@lanboot/validators";
import { storage } from "@lanboot/storage";
import { $ } from "zx";
import lio from "@/lib/lio";

interface Dependency {
  package: string;
  services: string[];
  configurator: (config: ConfigInput) => Promise<void>;
  path?: string;
}

const dependencies: Dependency[] = [
  {
    path: "/etc/dnsmasq.d/lanboot.conf",
    package: "dnsmasq",
    services: ["dnsmasq.service"],
    async configurator(config) {
      const filePath = path.resolve(this.path!);

      const hasConfiguration = await fsPromises
        .access(filePath, fsPromises.constants.F_OK)
        .then(() => true)
        .catch(() => false);

      if (hasConfiguration) {
        const backupPath = `${filePath}.bak`;
        const hasBackup = await fsPromises
          .access(backupPath, fsPromises.constants.F_OK)
          .then(() => true)
          .catch(() => false);

        if (!hasBackup) {
          await fsPromises.rename(filePath, backupPath);
        }
      }

      const configuration: Array<string | undefined> = [
        `interface=${config.NETWORK_INTERFACE}`,
        "bind-interfaces",
        undefined,
        "port=0",
        undefined,
        `dhcp-range=${config.NETWORK_ADDRESS},proxy`,
        undefined,
        "dhcp-match=set:ipxeclient,175",
        "dhcp-userclass=set:ipxeclient,iPXE",
        undefined,
        `pxe-service=tag:!ipxeclient,x86PC,"iPXE",${config.BOOT_FILENAME}`,
        undefined,
        "enable-tftp",
        `tftp-root=${config.TFTP_ROOT}`,
        undefined,
      ];

      const tempPath = `${this.path}.tmp`;

      await fsPromises.writeFile(tempPath, configuration.join("\n"));

      try {
        await $`dnsmasq --test -C ${tempPath}`;
        await fsPromises.writeFile(filePath, configuration.join("\n"));
      } finally {
        await fsPromises.rm(tempPath);
      }
    },
  },
  {
    package: "lvm2",
    services: [],
    async configurator(config) {
      const devices = await storage.device.findMany();
      const foundPool = await storage.pool.findOne(config.STORAGE_POOL);

      const provisionedDevices = await Promise.all(
        config.STORAGE_DEVICES.map(async (deviceName) => {
          const foundDevice = devices.find(
            (device) => device.pv_name === deviceName,
          );

          return foundDevice ?? (await storage.device.create(deviceName));
        }),
      );

      if (!foundPool) {
        const unusedDevices = provisionedDevices.filter(
          (device) => !device.vg_name,
        );

        if (unusedDevices.length === 0) {
          throw new Error(
            `Cannot create pool ${config.STORAGE_POOL}: no unused PVs available`,
          );
        }

        await storage.pool.create({
          name: config.STORAGE_POOL,
          devices: unusedDevices.map((device) => device.pv_name),
        });

        return;
      }

      const unusedDevices = provisionedDevices.filter(
        (device) => !device.vg_name,
      );

      const conflictingDevices = provisionedDevices.filter(
        (device) => device.vg_name && device.vg_name !== config.STORAGE_POOL,
      );

      if (conflictingDevices.length > 0) {
        throw new Error(
          `Storage devices belong to another VG: ${conflictingDevices
            .map((device) => `${device.pv_name} (${device.vg_name})`)
            .join(", ")}`,
        );
      }

      if (unusedDevices.length > 0) {
        await storage.pool.update(config.STORAGE_POOL, {
          addDevices: unusedDevices.map((device) => device.pv_name),
        });
      }

      let foundMaster = await storage.block.findOne(
        config.STORAGE_POOL,
        "master",
      );

      if (!foundMaster) {
        foundMaster = await storage.block.create({
          name: "master",
          pool: config.STORAGE_POOL,
          size: config.STORAGE_MASTER_SIZE,
        });
      }

      let foundMasterBackstoresBlock = await lio.backstores.block.get({
        name: config.STORAGE_MASTER,
      });

      if (!foundMasterBackstoresBlock) {
        foundMasterBackstoresBlock = await lio.backstores.block.create({
          dev: `/dev/${config.STORAGE_POOL}/${config.STORAGE_MASTER}`,
          name: config.STORAGE_MASTER,
          readOnly: false,
        });
      }

      let foundMasterIscsi = await lio.iscsi.get({
        wwn: `iqn.2026-10.lanboot.local:${config.STORAGE_MASTER}`,
      });

      if (!foundMasterIscsi) {
        foundMasterIscsi = await lio.iscsi.create({
          wwn: `iqn.2026-10.lanboot.local:${config.STORAGE_MASTER}`,
        });
      }

      let tpg1 = await foundMasterIscsi.tpg.get(1);

      if (!tpg1) {
        tpg1 = await foundMasterIscsi.tpg.create(1, { enable: false });
      }

      await tpg1.attrib.update({
        authentication: false,
        demo_mode_write_protect: false,
        prod_mode_write_protect: false,
        generate_node_acls: true,
        cache_dynamic_acls: true,
      });

      let lun0 = await tpg1.lun.get(0);

      if (!lun0) {
        lun0 = await tpg1.lun.create(0, foundMasterBackstoresBlock);
      }

      let portal = await tpg1.portal.get();

      if (!portal) {
        portal = await tpg1.portal.create();
      }

      await tpg1.enable();
    },
  },
];

export type { Dependency };
export { dependencies };

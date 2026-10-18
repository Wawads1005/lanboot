import fsPromises from "node:fs/promises";
import path from "node:path";
import type { ConfigInput } from "@lanboot/validators";
import { storage } from "@lanboot/storage";
import { $ } from "zx";
import lio from "@/lib/lio";
import {
  getNetworkInterfaceInfo,
  MASTER_LIO_BACKSTORES_BLOCK_NAME,
  MASTER_LIO_ISCSI_TARGET,
  MASTER_STORAGE_BLOCK_NAME,
  MASTER_STORAGE_BLOCK_PATH,
  STORAGE_POOL_NAME,
} from "@lanboot/core";

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

      const networkInterfaceInfo = getNetworkInterfaceInfo(
        config.NETWORK_INTERFACE,
      );

      const configuration: Array<string | undefined> = [
        `interface=${config.NETWORK_INTERFACE}`,
        "bind-interfaces",
        undefined,
        "port=0",
        undefined,
        `dhcp-range=${networkInterfaceInfo.address},proxy`,
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
      const foundStoragePool = await storage.pool.findOne(STORAGE_POOL_NAME);

      const provisionedDevices = await Promise.all(
        config.STORAGE_DEVICES.map(async (deviceName) => {
          const foundDevice = devices.find(
            (device) => device.pv_name === deviceName,
          );

          return foundDevice ?? (await storage.device.create(deviceName));
        }),
      );

      const unusedDevices = provisionedDevices.filter(
        (device) => !device.vg_name,
      );

      const conflictingDevices = provisionedDevices.filter(
        (device) => device.vg_name && device.vg_name !== STORAGE_POOL_NAME,
      );

      if (conflictingDevices.length > 0) {
        throw new Error(
          `Storage devices belong to another VG: ${conflictingDevices
            .map((device) => `${device.pv_name} (${device.vg_name})`)
            .join(", ")}`,
        );
      }

      if (!foundStoragePool) {
        if (unusedDevices.length === 0) {
          throw new Error(
            `Cannot create pool ${STORAGE_POOL_NAME}: no unused PVs available`,
          );
        }

        await storage.pool.create({
          name: STORAGE_POOL_NAME,
          devices: unusedDevices.map((device) => device.pv_name),
        });
      } else if (unusedDevices.length > 0) {
        await storage.pool.update(STORAGE_POOL_NAME, {
          addDevices: unusedDevices.map((device) => device.pv_name),
        });
      }

      let foundMasterStorageBlock = await storage.block.findOne(
        STORAGE_POOL_NAME,
        MASTER_STORAGE_BLOCK_NAME,
      );

      if (!foundMasterStorageBlock) {
        foundMasterStorageBlock = await storage.block.create({
          name: MASTER_STORAGE_BLOCK_NAME,
          pool: STORAGE_POOL_NAME,
          size: config.STORAGE_MASTER_SIZE,
        });
      }

      let foundMasterBackstoresBlock = await lio.backstores.block.get({
        name: MASTER_LIO_BACKSTORES_BLOCK_NAME,
      });

      if (!foundMasterBackstoresBlock) {
        foundMasterBackstoresBlock = await lio.backstores.block.create({
          dev: MASTER_STORAGE_BLOCK_PATH,
          name: MASTER_LIO_BACKSTORES_BLOCK_NAME,
          readOnly: false,
        });
      }

      let foundMasterLioIscsi = await lio.iscsi.get({
        wwn: MASTER_LIO_ISCSI_TARGET,
      });

      if (!foundMasterLioIscsi) {
        foundMasterLioIscsi = await lio.iscsi.create({
          wwn: MASTER_LIO_ISCSI_TARGET,
        });
      }

      let foundMasterLioIscsiTpg1 = await foundMasterLioIscsi.tpg.get(1);

      if (!foundMasterLioIscsiTpg1) {
        foundMasterLioIscsiTpg1 = await foundMasterLioIscsi.tpg.create(1, {
          enable: false,
        });
      }

      await foundMasterLioIscsiTpg1.attrib.update({
        authentication: false,
        demo_mode_write_protect: false,
        prod_mode_write_protect: false,
        generate_node_acls: true,
        cache_dynamic_acls: true,
      });

      let foundMasterLioIscsiTpg1Lun0 =
        await foundMasterLioIscsiTpg1.lun.get(0);

      if (!foundMasterLioIscsiTpg1Lun0) {
        foundMasterLioIscsiTpg1Lun0 = await foundMasterLioIscsiTpg1.lun.create(
          0,
          foundMasterBackstoresBlock,
        );
      }

      let foundMasterLioIscsiTpg1Portal =
        await foundMasterLioIscsiTpg1.portal.get();

      if (!foundMasterLioIscsiTpg1Portal) {
        foundMasterLioIscsiTpg1Portal =
          await foundMasterLioIscsiTpg1.portal.create();
      }

      await foundMasterLioIscsiTpg1.enable();
    },
  },
];

export type { Dependency };
export { dependencies };

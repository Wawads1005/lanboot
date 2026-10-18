import {
  SERVER_STATIC_DIRECTORY,
  getNetworkInterfaceInfo,
  LIO_ISCSI_PREFIX,
  STORAGE_POOL_NAME,
  STORAGE_POOL_PATH,
  MASTER_LIO_ISCSI_TARGET,
  MASTER_LIO_BACKSTORES_BLOCK_NAME,
  MASTER_STORAGE_BLOCK_NAME,
  MASTER_STORAGE_BLOCK_PATH,
  OVERLAY_STORAGE_BLOCK_PREFIX,
  OVERLAY_LIO_BACKSTORES_BLOCK_PREFIX,
  OVERLAY_LIO_ISCSI_PREFIX,
} from "@lanboot/core";
import { configInput } from "@lanboot/validators";

const parsedConfig = configInput.parse(process.env);

const config = {
  network: {
    interface: parsedConfig.NETWORK_INTERFACE,
    get address() {
      const networkInterfaceInfo = getNetworkInterfaceInfo(this.interface);

      return networkInterfaceInfo.address;
    },
  },
  lio: {
    iscsi: {
      prefix: LIO_ISCSI_PREFIX,
    },
  },
  server: {
    port: parsedConfig.SERVER_PORT,
    static: {
      directory: SERVER_STATIC_DIRECTORY,
    },
  },
  storage: {
    pool: {
      name: STORAGE_POOL_NAME,
      path: STORAGE_POOL_PATH,
    },
  },
  boot: {
    firmware: parsedConfig.BOOT_FIRMWARE,
    filename: parsedConfig.BOOT_FILENAME,
  },
  tftp: {
    root: parsedConfig.TFTP_ROOT,
  },
  master: {
    lio: {
      iscsi: {
        target: MASTER_LIO_ISCSI_TARGET,
      },
      backstores: {
        block: {
          name: MASTER_LIO_BACKSTORES_BLOCK_NAME,
        },
      },
    },
    storage: {
      block: {
        name: MASTER_STORAGE_BLOCK_NAME,
        path: MASTER_STORAGE_BLOCK_PATH,
      },
    },
  },
  overlay: {
    lio: {
      iscsi: {
        target(macAddress: string) {
          const target =
            `${config.lio.iscsi.prefix}:${OVERLAY_LIO_ISCSI_PREFIX}-${macAddress}` as const;

          return target;
        },
      },
      backstores: {
        block: {
          name(macAddress: string) {
            return `${OVERLAY_LIO_BACKSTORES_BLOCK_PREFIX}-${macAddress}` as const;
          },
        },
      },
    },
    storage: {
      block: {
        name(macAddress: string) {
          return `${OVERLAY_STORAGE_BLOCK_PREFIX}-${macAddress}` as const;
        },
        path(macAddress: string) {
          return `${config.storage.pool.path}/${this.name(macAddress)}` as const;
        },
        size: parsedConfig.STORAGE_OVERLAY_SIZE,
      },
    },
  },
} as const;

export default config;

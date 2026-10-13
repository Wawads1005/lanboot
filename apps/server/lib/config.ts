import {
  SERVER_STATIC_DIRECTORY,
  getNetworkInterfaceInfo,
  LIO_ISCSI_PREFIX,
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
    pool: parsedConfig.STORAGE_POOL,
    master: {
      name: parsedConfig.STORAGE_MASTER,
      size: parsedConfig.STORAGE_MASTER_SIZE,
    },
    overlay: {
      size: parsedConfig.STORAGE_OVERLAY_SIZE,
    },
  },
  boot: {
    firmware: parsedConfig.BOOT_FIRMWARE,
    filename: parsedConfig.BOOT_FILENAME,
  },
  tftp: {
    root: parsedConfig.TFTP_ROOT,
  },
};

export default config;

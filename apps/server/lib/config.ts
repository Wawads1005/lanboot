import { getNetworkInterfaceInfo } from "@lanboot/core";
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
      prefix: "iqn.2026-10.lanboot.local",
    },
  },
  api: {
    port: parsedConfig.API_PORT,
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

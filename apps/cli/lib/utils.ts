import os from "node:os";
import { $ } from "zx";

const interfaces = os.networkInterfaces();

function detectInterfaces() {
  const networkInterfaces = Object.keys(interfaces).filter(
    (input) => input !== "lo",
  );

  return networkInterfaces;
}

function detectInterfaceInfo(networkInterface: string) {
  const networkInterfaceInfo = interfaces[networkInterface]?.find(
    (info) => info.family === "IPv4",
  );

  if (!networkInterfaceInfo) {
    throw new Error("No network interface choosen");
  }

  return networkInterfaceInfo;
}

interface Blockdevice {
  name: string;
  size: string;
  type: string;
  model: string;
  path: string;
  pkname?: string;
  mountpoints: (string | null)[];
  children?: Blockdevice[];
}

interface BlockResponse {
  blockdevices: Blockdevice[];
}

async function detectBlockdevices() {
  const { blockdevices } =
    await $`lsblk -e 7,11,252 -o name,size,type,model,path,pkname,mountpoints -J`.json<BlockResponse>();

  const rootDevices = new Set<string>();

  const getRootDevices = (devices: Blockdevice[]) => {
    for (const device of devices) {
      if (device.mountpoints?.includes("/")) {
        rootDevices.add(
          device.type === "disk" ? device.path : `/dev/${device.pkname}`,
        );
      }

      if (device.children) {
        getRootDevices(device.children);
      }
    }
  };

  getRootDevices(blockdevices);

  return blockdevices.filter(
    (device) => device.type === "disk" && !rootDevices.has(device.path),
  );
}

export { detectInterfaces, detectInterfaceInfo, detectBlockdevices };

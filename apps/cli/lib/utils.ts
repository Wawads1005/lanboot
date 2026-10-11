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
}

interface BlockResponse {
  blockdevices: Blockdevice[];
}

interface FileSystem {
  target: string;
  source: string;
}

interface FileSystemResponse {
  filesystems: FileSystem[];
}

async function detectBlockdevices() {
  const { blockdevices } =
    await $`lsblk -e 7,11,252 -o name,size,type,model,path -d -J`.json<BlockResponse>();

  const { filesystems } =
    await $`findmnt / -o target,source -J`.json<FileSystemResponse>();

  const rootFS = filesystems.at(0);

  if (!rootFS) {
    throw new Error("Couldn't identify root fs");
  }

  const devices = blockdevices.filter(
    (blockdevice) => !rootFS.source.includes(blockdevice.name),
  );

  return devices;
}

export { detectInterfaces, detectInterfaceInfo, detectBlockdevices };

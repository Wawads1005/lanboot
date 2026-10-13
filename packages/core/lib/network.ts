import os from "node:os";

function getNetworkInterfaceInfo(networkInterface: string) {
  const networkInterfaces = os.networkInterfaces();
  const foundNetworkInterfaceInfos = networkInterfaces[networkInterface];

  if (!foundNetworkInterfaceInfos) {
    throw new Error("No network interface found");
  }

  const networkInterfaceInfo = foundNetworkInterfaceInfos.find(
    (networkInterfaceInfo) => networkInterfaceInfo.family === "IPv4",
  );

  if (!networkInterfaceInfo) {
    throw new Error("No network interface info found");
  }

  return networkInterfaceInfo;
}

export { getNetworkInterfaceInfo };

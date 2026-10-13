import { loadConfiguration } from "@/lib/configuration";
import { interpolate, iPXE } from "@lanboot/ipxe";
import { getNetworkInterfaceInfo } from "@lanboot/core";
import { Command } from "commander";
import path from "node:path";
import fsPromises from "node:fs/promises";

const generator = new Command("generate");

generator
  .command("ipxe")
  .description("generate an ipxe script embedding it to NBP")
  .option("-o, --output <path>", "Output file", "lanboot.ipxe")
  .action(async (options) => {
    const config = await loadConfiguration();
    const networkInterfaceInfo = getNetworkInterfaceInfo(
      config.NETWORK_INTERFACE,
    );

    const ipxe = new iPXE();

    ipxe.ifconf();
    ipxe.set("next-server", networkInterfaceInfo.address);
    ipxe.imgexec(
      undefined,
      interpolate`http://${"next-server"}:${config.API_PORT}/api/boot`,
    );

    await fsPromises.writeFile(path.resolve(options.output), ipxe.build());
  });

export { generator };

import fsPromises from "node:fs/promises";
import { LanbootConfiguration } from "@/schemas/lanboot";
import { DHCP_CONFIGURATION_FILEPATH } from "@/constants/dhcp";

async function configureDHCP(configuration: LanbootConfiguration) {
  const { network, dhcp } = configuration;

  const dhcpConfiguration = [
    `interface=${network.interface}`,
    "bind-interfaces",
    `dhcp-range=${dhcp.rangeStart},${dhcp.proxy ? "proxy" : dhcp.rangeEnd}, ${network.netmask}`,
  ];

  await fsPromises.writeFile(
    DHCP_CONFIGURATION_FILEPATH,
    `${dhcpConfiguration.join("\n")}\n`,
  );
}

export { configureDHCP };

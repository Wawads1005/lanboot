import fsPromises from "node:fs/promises";
import { LanbootConfiguration } from "@/schemas/lanboot";
import { DHCP_CONFIGURATION_FILEPATH } from "@/constants/dhcp";

async function configureDHCP(configuration: LanbootConfiguration) {
  const { network, dhcp, http, image } = configuration;

  const dhcpConfiguration = [
    `interface=${network.interface}`,
    "bind-interfaces",
    "port=0",
    `dhcp-range=${dhcp.rangeStart},${dhcp.proxy ? "proxy" : dhcp.rangeEnd},${network.netmask}`,
    "# Detect CPU architecture",
    "dhcp-match=set:bios,option:client-arch,0",
    "dhcp-match=set:efi_x86-64,option:client-arch,7",
    "dhcp-match=set:efi_x86-64,option:client-arch,9",

    "# Detect iPXE",
    "dhcp-userclass=set:ipxeclient,iPXE",

    `dhcp-boot=tag:!ipxeclient,tag:bios,${dhcp.biosBootfile}`,
    `dhcp-boot=tag:!ipxeclient,tag:efi_x86-64,${dhcp.uefiBootfile}`,

    `pxe-service=tag:!ipxeclient,x86PC,"iPXE (Bios)",${dhcp.biosBootfile}`,
    `pxe-service=tag:!ipxeclient,x86-64_EFI,"iPXE (UEFI)",${dhcp.uefiBootfile}`,

    `dhcp-boot=tag:ipxeclient,http://${network.address}/${dhcp.ipxeBootfile}`,
  ];

  const ipxeBoot = [
    "#!ipxe",
    "dhcp net0",
    "set net0/gateway 0.0.0.0",
    "set keep-san 1",

    `sanhook -d 0x80 iscsi:${network.address}::::${image.iqnPrefix}:${image.master}`,

    `kernel http://${network.address}/windows/winpe/wimboot wimboot index=0`,
    `initrd http://${network.address}/windows/winpe/boot/bcd BCD`,
    `initrd http://${network.address}/windows/winpe/boot/boot.sdi boot.sdi`,
    `initrd http://${network.address}/windows/winpe/sources/boot.wim boot.wim`,
    "boot",
  ];

  await fsPromises.mkdir(`${http.root}/windows/winpe/boot`, {
    recursive: true,
  });
  await fsPromises.mkdir(`${http.root}/windows/winpe/sources`, {
    recursive: true,
  });

  await fsPromises.writeFile(
    `${http.root}/${dhcp.ipxeBootfile}`,
    `${ipxeBoot.join("\n")}\n`,
  );

  await fsPromises.writeFile(
    DHCP_CONFIGURATION_FILEPATH,
    `${dhcpConfiguration.join("\n")}\n`,
  );
}

export { configureDHCP };

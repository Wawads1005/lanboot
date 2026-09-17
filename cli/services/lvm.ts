import { LanbootConfiguration } from "@/schemas/lanboot";
import { $ } from "zx";

$.shell = "/usr/bin/bash";
$.nothrow = true;

async function configureLVM(configuration: LanbootConfiguration) {
  const { lvm } = configuration;

  const response = await $`vgdisplay ${lvm.volumeGroup}`;

  if (!response.ok) {
    const devices = lvm.physicalDevices.join(" ");

    await $`pvcreate ${devices} --yes`;
    await $`vgcreate ${lvm.volumeGroup} ${devices} --yes`;
  }
}

export { configureLVM };

import { LanbootConfiguration } from "@/schemas/lanboot";
import { $ } from "zx";

$.shell = "/usr/bin/bash";
$.nothrow = true;

async function configureLIO(configuration: LanbootConfiguration) {
  const { lvm, iscsi, image } = configuration;

  const volumeGroup = `/dev/${lvm.volumeGroup}`;
  const masterLV = `${volumeGroup}/${image.master}`;
  const masterIqn = `${image.iqnPrefix}:${image.master}`;

  const vg = await $`vgdisplay ${volumeGroup}`;

  if (!vg.ok) {
    await $`vgcreate ${lvm.volumeGroup} ${lvm.physicalDevices}`;
  }

  const lv = await $`lvdisplay ${masterLV}`;

  if (!lv.ok) {
    await $`lvcreate -L ${image.masterSize} -n ${image.master} ${lvm.volumeGroup} --yes`;
  }

  const backstores = await $`targetcli /backstores/block ls`;

  if (!backstores.stdout.includes(image.master)) {
    await $`targetcli /backstores/block create ${image.master} ${masterLV}`;
  }

  const targets = await $`targetcli /iscsi ls`;

  if (!targets.stdout.includes(masterIqn)) {
    await $`targetcli /iscsi create ${masterIqn}`;
  }

  const luns = await $`targetcli /iscsi/${masterIqn}/tpg1/luns ls`;

  if (!luns.stdout.includes(image.master)) {
    await $`targetcli /iscsi/${masterIqn}/tpg1/luns create /backstores/block/${image.master}`;
  }

  const portals = await $`targetcli /iscsi/${masterIqn}/tpg1/portals ls`;

  if (!portals.stdout.includes(`${iscsi.address}:${iscsi.port}`)) {
    await $`targetcli /iscsi/${masterIqn}/tpg1/portals create ${iscsi.address} ${iscsi.port}`;
  }

  await $`targetcli /iscsi/${masterIqn}/tpg1 set attribute authentication=0 demo_mode_write_protect=0 generate_node_acls=1`;
  await $`targetcli saveconfig`;
}

export { configureLIO };

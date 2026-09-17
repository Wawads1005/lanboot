import { CONFIG_FILEPATH } from "@/constants/config";
import {
  DNSMASQ_D_DIRECTORY,
  SAMBA_CONFIGURATION_DIRECTORY,
} from "@/constants/internals";
import { getConfiguration } from "@/lib/configure";
import { $ } from "zx";

$.shell = "/usr/bin/bash";
$.nothrow = true;
$.verbose = true;

async function installServices() {
  const response = await $`apt-get install dnsmasq nginx samba lvm2 -y`;

  return response;
}

async function uninstallServices() {
  const configuration = await getConfiguration();

  await $`targetcli clearconfig true`;
  await $`rm -rf ${CONFIG_FILEPATH}`;
  await $`rm -rf ${DNSMASQ_D_DIRECTORY}/lanboot-*`;
  await $`rm -rf ${SAMBA_CONFIGURATION_DIRECTORY}`;

  if (configuration) {
    const masterPath = `/dev/${configuration.storage.pool}/${configuration.image.master}`;

    await $`lvremove ${masterPath} --yes`;
    await $`vgremove ${configuration.storage.pool} --yes`;
    await $`pvremove ${configuration.storage.devices} --yes`;

    for await (const share of configuration.smb.shares) {
      await $`rm -rf ${share.path}`;
    }

    await $`rm -rf ${configuration.http.root}`;
    await $`rm -rf ${configuration.tftp.root}`;
  }

  await $`apt-get remove dnsmasq nginx samba lvm2 -y`;
  await $`apt-get remove dnsmasq-base -y`;
  await $`apt-get purge -y`;
  await $`apt-get auto-remove -y`;
}

async function startServices() {
  const response =
    await $`systemctl start dnsmasq.service nginx.service smbd.service`;

  return response;
}

interface GetIdInput {
  user: string;
  options?: {
    userId?: boolean;
    groupId?: boolean;
  };
}

async function getId(input: GetIdInput) {
  const args: string[] = [];

  if (input.options) {
    if (input.options.userId) {
      args.push("--user");
    }

    if (input.options.groupId) {
      args.push("--group");
    }
  }

  args.push(input.user);

  const id = await $`id ${args}`;

  return id;
}

interface GetStorageInput {
  device: string;
}

async function getStorage(input: GetStorageInput) {
  const args: string[] = [];

  args.push(input.device);

  const response = await $`pvdisplay ${args}`;

  return response;
}

interface CreateStorageInput {
  devices: string[];
  options?: {
    force?: boolean;
    metadataIgnore?: boolean;
  };
}

async function createStorage(input: CreateStorageInput) {
  const args: string[] = [];

  if (input.options) {
    if (input.options.force) {
      args.push("--force");
    }

    if (typeof input.options.metadataIgnore !== "undefined") {
      args.push("--metadataignore", input.options.metadataIgnore ? "y" : "n");
    }
  }

  args.push(...input.devices);

  const response = await $`pvcreate ${args}`;

  return response;
}

interface GetStoragePoolInput {
  path: string;
}

async function getStoragePool(input: GetStoragePoolInput) {
  const args: string[] = [];

  args.push(input.path);

  const response = await $`vgdisplay ${args}`;

  return response;
}

interface CreateStoragePoolInput {
  name: string;
  devices: string[];
  options?: {
    force?: boolean;
  };
}

async function createStoragePool(input: CreateStoragePoolInput) {
  const args: string[] = [];

  if (input.options) {
    if (input.options.force) {
      args.push("--force");
    }
  }

  args.push(input.name);
  args.push(...input.devices);

  const response = await $`vgcreate ${args}`;

  return response;
}

interface GetStorageBlockInput {
  path: string;
}

async function getStorageBlock(input: GetStorageBlockInput) {
  const args: string[] = [];

  args.push(input.path);

  const response = await $`lvdisplay ${args}`;

  return response;
}

interface CreateStorageBlockInput {
  pool: string;
  options: {
    name: string;
    size: string;
    type?: "snapshot" | "linear";
    path?: string;
  };
}

async function createStorageBlock(input: CreateStorageBlockInput) {
  const args: string[] = [];

  input.options.type
    ? args.push("--type", input.options.type)
    : args.push("--type", "linear");

  args.push("--name", input.options.name);
  args.push("--size", input.options.size);

  input.options.type === "linear" || input.options.type === undefined
    ? args.push(input.pool)
    : input.options.path && args.push(input.options.path);

  const response = await $`lvcreate ${args}`;

  return response;
}

interface GetStorageBackstoresInput {
  name: string;
}

async function getStorageBackstores(input: GetStorageBackstoresInput) {
  const args: string[] = [];

  args.push(input.name);

  const response = await $`targetcli /backstores/block ls ${args}`;

  return response;
}

interface CreateStorageBackstoresInput {
  name: string;
  device: string;
}

async function createStorageBackstores(input: CreateStorageBackstoresInput) {
  const args: string[] = [];

  args.push(`name=${input.name}`);
  args.push(`dev=${input.device}`);

  const response = await $`targetcli /backstores/block create ${args}`;

  return response;
}

interface GetStorageTargetInput {
  wwn: string;
}

async function getStorageTarget(input: GetStorageTargetInput) {
  const args: string[] = [];

  args.push(`${input.wwn}`);

  const response = await $`targetcli /iscsi ls ${args}`;

  return response;
}

interface CreateStorageTargetInput {
  wwn: string;
}

async function createStorageTarget(input: CreateStorageTargetInput) {
  const args: string[] = [];

  args.push(`wwn=${input.wwn}`);

  const response = await $`targetcli /iscsi/ create ${args}`;

  return response;
}

interface GetStoragetTargetLunInput {
  wwn: string;
  lun: number;
}

async function getStorageTargetLun(input: GetStoragetTargetLunInput) {
  const response =
    await $`targetcli /iscsi/${input.wwn}/tpg1/luns ls lun${input.lun}`;

  return response;
}

interface CreateStoragetTargetLunInput {
  wwn: string;
  lun: number;
  storageObject: string;
}

async function createStorageTargetLun(input: CreateStoragetTargetLunInput) {
  const response =
    await $`targetcli /iscsi/${input.wwn}/tpg1/luns create lun=${input.lun} storage_object=${input.storageObject}`;

  return response;
}

type StorageTargetAttributes =
  | "authentication"
  | "generate_node_acls"
  | "demo_mode_write_protect"
  | "prod_mode_write_protect";

interface GetStorageTargetAttributeInput {
  wwn: string;
  attribute: StorageTargetAttributes;
}

async function getStoragetTargetAttribute(
  input: GetStorageTargetAttributeInput,
) {
  const response =
    await $`targetcli /iscsi/${input.wwn}/tpg1 get attribute ${input.attribute}`;

  return response;
}

interface SetStoragetTargetAttributeInput {
  wwn: string;
  attribute: StorageTargetAttributes;
  value: number;
}

async function setStorageTargetAttribute(
  input: SetStoragetTargetAttributeInput,
) {
  const response =
    await $`targetcli /iscsi/${input.wwn}/tpg1 set attribute ${input.attribute}=${input.value}`;

  return response;
}

export {
  installServices,
  uninstallServices,
  startServices,
  getId,
  getStorage,
  createStorage,
  getStoragePool,
  createStoragePool,
  getStorageBlock,
  createStorageBlock,
  getStorageBackstores,
  createStorageBackstores,
  getStorageTarget,
  createStorageTarget,
  getStorageTargetLun,
  createStorageTargetLun,
  getStoragetTargetAttribute,
  setStorageTargetAttribute,
};

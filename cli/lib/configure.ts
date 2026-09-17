import fsPromises from "node:fs/promises";
import toml from "smol-toml";
import { CONFIG_FILEPATH } from "@/constants/config";
import { LanbootConfiguration } from "@/schemas/lanboot";

const defaultConfiguration: LanbootConfiguration = {
  network: {
    interface: "enp3s0",
    address: "192.168.100.243",
    netmask: "255.255.255.0",
  },

  dhcp: {
    rangeStart: "192.168.100.1",
    rangeEnd: "192.168.100.254",
    proxy: true,
  },

  tftp: {
    enable: true,
    root: "/srv/tftp",
  },

  http: {
    enable: true,
    root: "/var/www/html",
  },

  smb: {
    workgroup: "WORKGROUP",
    serverString: "Lanboot",
    serverRole: "standalone",
    mapToGuest: "bad user",
    shares: [
      {
        name: "shared",
        path: "/srv/smb/shared",
        browseable: true,
        readOnly: false,
        guestOK: true,
        createMask: "0755",
        directoryMask: "0755",
      },
      {
        name: "installation",
        path: "/srv/smb/installation",
        browseable: true,
        readOnly: false,
        guestOK: true,
        createMask: "0755",
        directoryMask: "0755",
      },
    ],
  },
  lvm: {
    volumeGroup: "lanboot",
    physicalDevices: ["/dev/sdb"],
  },
  image: {
    iqnPrefix: "iqn.2026-09.wawads.dev",
    master: "master",
    masterUpdate: "master-update",
    masterSize: "100G",
  },
  iscsi: {
    port: 3260,
  },
};

async function getHasConfiguration() {
  try {
    await fsPromises.access(CONFIG_FILEPATH, fsPromises.constants.F_OK);

    return true;
  } catch (error) {
    return false;
  }
}

async function getConfiguration() {
  const hasConfiguration = await getHasConfiguration();

  if (!hasConfiguration) {
    return null;
  }

  try {
    const configurationToml = await fsPromises.readFile(
      CONFIG_FILEPATH,
      "utf-8",
    );

    const configuration = toml.parse(configurationToml) as LanbootConfiguration;

    return configuration;
  } catch (error) {
    if (error instanceof toml.TomlError) {
      console.error(`config: ${error.message}`);
    }

    return null;
  }
}

async function setConfiguration(configuration: LanbootConfiguration) {
  const configurationToml = toml.stringify(configuration);

  await fsPromises.writeFile(CONFIG_FILEPATH, configurationToml);
}

export { getConfiguration, setConfiguration, defaultConfiguration };

import type {
  iPXEAuthenticationSettings,
  iPXECryptographySettings,
  iPXEHostSettings,
  iPXEMiscellaneousSettings,
  iPXENetworkSettings,
  iPXESetting,
} from "@/lib/settings";

type iPXEInterpolation = iPXESetting | (string & {}) | number;

type iPXEOtherSettings = iPXEAuthenticationSettings &
  iPXECryptographySettings &
  iPXEMiscellaneousSettings;

const networkKeys: Record<keyof iPXENetworkSettings, true> = {
  mac: true,
  bustype: true,
  busloc: true,
  busid: true,
  chip: true,
  ssid: true,
  "active-scan": true,
  key: true,
  ip: true,
  netmask: true,
  gateway: true,
  dns: true,
  domain: true,
  filename: true,
  "next-server": true,
  "root-path": true,
  "san-filename": true,
  "initiator-iqn": true,
  "keep-san": true,
  "skip-san-boot": true,
};

const hostKeys: Record<keyof iPXEHostSettings, true> = {
  hostname: true,
  uuid: true,
  "user-class": true,
  manufacturer: true,
  product: true,
  serial: true,
  asset: true,
};

const otherKeys: Record<keyof iPXEOtherSettings, true> = {
  username: true,
  password: true,
  "reverse-username": true,
  "reverse-password": true,
  crosscert: true,
  trust: true,
  cert: true,
  privkey: true,
  buildarch: true,
  cpumodel: true,
  cpuvendor: true,
  cwduri: true,
  cwuri: true,
  "dhcp-server": true,
  dmesg: true,
  keymap: true,
  memsize: true,
  platform: true,
  priority: true,
  scriptlet: true,
  syslog: true,
  syslogs: true,
  sysmac: true,
  unixtime: true,
  "use-cached": true,
  version: true,
  vram: true,
};

type MetaKey = typeof metaKey;

const metaKey = {
  ctrlA: "0x01",
  ctrlB: "0x02",
  ctrlC: "0x03",
  ctrlZ: "0x1a",
  f5: "0x107e",
  f6: "0x127e",
  f7: "0x137e",
  f8: "0x147e",
  f9: "0x157e",
  f10: "0x167e",
  f11: "0x187e",
  f12: "0x197e",
};

function interpolate(
  strings: TemplateStringsArray,
  ...values: iPXEInterpolation[]
) {
  return strings.reduce((out, chunk, i) => {
    const value = values[i - 1];

    return (
      out +
      (typeof value === "string" && isSetting(value)
        ? `\${${value}}`
        : `${value}`) +
      chunk
    );
  });
}

function isSetting(value: string): value is iPXESetting {
  const has = (record: Record<string, unknown>, key: string) => {
    const hasProperty = Object.hasOwn(record, key);

    return hasProperty;
  };

  const slash = value.indexOf("/");

  if (slash === -1) {
    return (
      has(networkKeys, value) || has(hostKeys, value) || has(otherKeys, value)
    );
  }

  const scope = value.slice(0, slash);
  const key = value.slice(slash + 1);

  if (scope === "smbios") {
    return has(hostKeys, key);
  }

  if (/^net(\d+|X)$/.test(scope)) {
    return has(networkKeys, key);
  }

  return false;
}

export type { MetaKey, iPXEInterpolation, iPXEOtherSettings };
export { interpolate, isSetting, metaKey, hostKeys, networkKeys, otherKeys };

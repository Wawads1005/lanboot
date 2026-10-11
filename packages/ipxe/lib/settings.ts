interface iPXENetworkDeviceSettings {
  /** Specifies the MAC address used to identify the network device in all transmitted and received packets. */
  mac: string;
  /** Describes the type of the hardware bus to which the network device is attached. */
  bustype: string;
  /** Describes the location on the hardware bus to which the network device is attached. For example, the location of a PCI device will be its bus:dev.fn address. */
  busloc: number;
  busid: string;
  /** Describes the chip type of the network device. */
  chip: string;
  ssid: string;
  "active-scan": number;
  key: string;
}

interface iPXEIPv4Settings {
  ip: string;
  netmask: string;
  gateway: string;
  /** Specifies the DNS (Domain Name System) server address used for resolving DNS (Domain Name System) names (such as “boot.ipxe.org”) to IP addresses (such as “212.13.204.60”). */
  dns: string;
  /** Specifies the DNS (Domain Name System) domain used as the default domain when resolving unqualified names. */
  domain: string;
}

interface iPXEBootSettings {
  filename: string;
  "next-server": string;
  "root-path": string;
  /** Specifies the filename for the bootloader within a SAN target. */
  "san-filename": string;
  /** Specifies the iSCSI initiator name used when connecting to an iSCSI target. */
  "initiator-iqn": string;
  "keep-san": number;
  "skip-san-boot": number;
}

interface iPXEHostSettings {
  hostname: string;
  /** Contains the system UUID, which should be a globally unique and permanent identifier for the system. */
  uuid: string;
  /** Specifies the user class sent by iPXE in DHCP (Dynamic Host Configuration Protocol) requests. */
  "user-class": string;
  manufacturer: string;
  product: string;
  /** Contains the system serial number, read from the system's SMBIOS information. */
  serial: string;
  asset: string;
}

interface iPXEAuthenticationSettings {
  username: string;
  password: string;
  "reverse-username": string;
  "reverse-password": string;
}

interface iPXECryptographySettings {
  /** Specifies the source URI (Uniform Resource Identifier) for cross-signed CA certificates. */
  crosscert: string;
  /** Specifies the SHA-256 fingerprints of the X.509 certificates that will be trusted by iPXE. */
  trust: string;
  /** Specifies the client certificate used to authenticate iPXE to TLS servers. */
  cert: string;
  /** Specifies the client private key used to authenticate iPXE to TLS servers. */
  privkey: string;
}

interface iPXEMiscellaneousSettings {
  /** Specifies the CPU architecture for which this version of iPXE was compiled. */
  buildarch: string;
  /** Represents the CPU model in the form returned by the CPUID instruction. */
  cpumodel: string;
  /** Represents the CPU vendor in the form returned by the CPUID instruction. */
  cpuvendor: string;
  /** Represents the directory portion of the current working URI (Uniform Resource Identifier). */
  cwduri: string;
  /** Represents the current working URI (Uniform Resource Identifier). */
  cwuri: string;
  "dhcp-server": string;
  /** Represents the most recent 8kB of recorded console output. */
  dmesg: string;
  /** Specifies the keyboard map used by iPXE. */
  keymap: string;
  /** Represents the size of system RAM, in MB (Megabyte). */
  memsize: number;
  /** Specifies the firmware platform on which iPXE is running. */
  platform: string;
  priority: number;
  scriptlet: string;
  /** Specifies the syslog server address used for recording iPXE output to a remote logfile. */
  syslog: string;
  /** Specifies the encrypted syslog server address used for recording iPXE output to a remote logfile. */
  syslogs: string;
  /** Specifies the system MAC address applied to externally pluggable USB network cards (or docking stations). */
  sysmac: string;
  /** Shows the current time (measured in seconds since the Unix Epoch, i.e. since January 1 1970 00:00:00). */
  unixtime: number;
  "use-cached": number;
  /** Describes the version of this build of iPXE. */
  version: string;
  /** Represents the raw contents of video RAM. */
  vram: string;
}

type iPXENetworkInterface = `net${number | "X"}`;
type iPXEDrive = `0x8${number}`;

type iPXENetworkSettings = iPXENetworkDeviceSettings &
  iPXEIPv4Settings &
  iPXEBootSettings;

type iPXEScopedSetting =
  | `${iPXENetworkInterface}/${keyof iPXENetworkSettings}`
  | `smbios/${keyof iPXEHostSettings}`;

type iPXESetting = keyof iPXESettings | iPXEScopedSetting;

type iPXESettingValue<T extends iPXESetting> = T extends keyof iPXESettings
  ? iPXESettings[T]
  : T extends `${iPXENetworkInterface}/${infer K}`
    ? K extends keyof iPXENetworkSettings
      ? iPXENetworkSettings[K]
      : never
    : T extends `smbios/${infer K}`
      ? K extends keyof iPXEHostSettings
        ? iPXEHostSettings[K]
        : never
      : never;

type iPXESettings = iPXENetworkDeviceSettings &
  iPXEIPv4Settings &
  iPXEBootSettings &
  iPXEHostSettings &
  iPXEAuthenticationSettings &
  iPXECryptographySettings &
  iPXEMiscellaneousSettings;

export type {
  iPXENetworkDeviceSettings,
  iPXEIPv4Settings,
  iPXEBootSettings,
  iPXEHostSettings,
  iPXEAuthenticationSettings,
  iPXECryptographySettings,
  iPXEMiscellaneousSettings,
  iPXENetworkInterface,
  iPXEDrive,
  iPXENetworkSettings,
  iPXEScopedSetting,
  iPXESetting,
  iPXESettingValue,
  iPXESettings,
};

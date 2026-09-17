import z from "zod";

const NetworkConfigurationSchema = z.object({
  interface: z.string().min(1, { error: "Network interface is required" }),
  address: z.string().min(1, { error: "Network address is required" }),
  netmask: z.string().min(1, { error: "Network netmask is required" }),
});

type NetworkConfiguration = z.infer<typeof NetworkConfigurationSchema>;

const DHCPConfigurationSchema = z.object({
  rangeStart: z.string().min(1, { error: "DHCP range start is required" }),
  rangeEnd: z.string().min(1, { error: "DHCP range end is required" }),
  proxy: z.boolean(),

  biosBootfile: z.string().min(1, { error: "DHCP bios bootfile is required" }),
  ipxeBootfile: z.string().min(1, { error: "DHCP ipxe bootfile is required" }),
  uefiBootfile: z.string().min(1, { error: "DHCP uefi bootfile is required" }),
});

type DHCPConfiguration = z.infer<typeof DHCPConfigurationSchema>;

const TFTPConfigurationSchema = z.object({
  enable: z.boolean(),
  root: z.string().min(1, { error: "TFTP root is required" }),
});

type TFTPConfiguration = z.infer<typeof TFTPConfigurationSchema>;

const HTTPConfigurationSchema = z.object({
  enable: z.boolean(),
  root: z.string().min(1, { error: "HTTP root is required" }),
});

type HTTPConfiguration = z.infer<typeof HTTPConfigurationSchema>;

const SMBShareConfigurationSchema = z.object({
  name: z.string().min(1, { error: "Share name is required" }),
  comment: z.string().optional(),
  path: z.string().min(1, { error: "Share path is required" }),
  browseable: z.boolean(),
  readOnly: z.boolean(),
  guestOK: z.boolean(),
  createMask: z.string(),
  directoryMask: z.string(),
});

type SMBShareConfiguration = z.infer<typeof SMBShareConfigurationSchema>;

const SMBConfigurationSchema = z.object({
  workgroup: z.string().min(1, { error: "SMB workgroup is required" }),
  serverString: z.string().min(1, { error: "SMB server string is required" }),
  serverRole: z.enum(["standalone", "member"]),
  shares: z.array(SMBShareConfigurationSchema),
  mapToGuest: z.enum(["never", "bad user", "bad password"]),
});

type SMBConfiguration = z.infer<typeof SMBConfigurationSchema>;

const LVMConfigurationSchema = z.object({
  pool: z.string().min(1, { error: "LVM volume group is required" }),
  devices: z
    .array(z.string())
    .min(1, { error: "LVM physical devices must have atleast one device." }),
});

type LVMConfiguration = z.infer<typeof LVMConfigurationSchema>;

const iSCSIConfigurationSchema = z.object({
  port: z.number().min(1, { error: "iSCSI port is required" }),
});

type iSCSIConfiguration = z.infer<typeof iSCSIConfigurationSchema>;

const ImageConfigurationSchema = z.object({
  master: z.string().min(1, { error: "Image master is required" }),
  masterUpdate: z.string().min(1, { error: "Image master update is required" }),
  masterSize: z.string().min(1, { error: "Image size is required" }),
  masterArchitecture: z.enum(["bios", "efi_x86-64"]),
  iqnPrefix: z.string().min(1, { error: "Image iqn prefix is required" }),
});

type ImageConfiguration = z.infer<typeof ImageConfigurationSchema>;

const LanbootConfigurationSchema = z.object({
  network: NetworkConfigurationSchema,
  dhcp: DHCPConfigurationSchema,
  tftp: TFTPConfigurationSchema,
  http: HTTPConfigurationSchema,
  smb: SMBConfigurationSchema,
  storage: LVMConfigurationSchema,
  iscsi: iSCSIConfigurationSchema,
  image: ImageConfigurationSchema,
});

type LanbootConfiguration = z.infer<typeof LanbootConfigurationSchema>;

export type {
  DHCPConfiguration,
  HTTPConfiguration,
  LanbootConfiguration,
  NetworkConfiguration,
  SMBConfiguration,
  SMBShareConfiguration,
  TFTPConfiguration,
  LVMConfiguration,
  iSCSIConfiguration,
  ImageConfiguration,
};

export {
  DHCPConfigurationSchema,
  HTTPConfigurationSchema,
  LanbootConfigurationSchema,
  NetworkConfigurationSchema,
  SMBConfigurationSchema,
  SMBShareConfigurationSchema,
  TFTPConfigurationSchema,
  LVMConfigurationSchema,
  iSCSIConfigurationSchema,
  ImageConfigurationSchema,
};

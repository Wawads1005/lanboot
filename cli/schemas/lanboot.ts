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

const LanbootConfigurationSchema = z.object({
  network: NetworkConfigurationSchema,
  dhcp: DHCPConfigurationSchema,
  tftp: TFTPConfigurationSchema,
  http: HTTPConfigurationSchema,
  smb: SMBConfigurationSchema,
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
};

export {
  DHCPConfigurationSchema,
  HTTPConfigurationSchema,
  LanbootConfigurationSchema,
  NetworkConfigurationSchema,
  SMBConfigurationSchema,
  SMBShareConfigurationSchema,
  TFTPConfigurationSchema,
};

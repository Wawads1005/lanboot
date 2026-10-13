import z from "zod";

type ConfigInput = z.infer<typeof configInput>;

const configInput = z.object({
  NETWORK_INTERFACE: z.string(),

  SERVER_PORT: z.number().or(z.string().transform((input) => Number(input))),

  STORAGE_POOL: z.string(),
  STORAGE_MASTER: z.string(),
  STORAGE_MASTER_SIZE: z.string(),
  STORAGE_OVERLAY_SIZE: z.string(),
  STORAGE_DEVICES: z
    .array(z.string())
    .or(z.string().transform((input) => input.split(","))),

  BOOT_FIRMWARE: z.enum(["bios", "uefi"]),
  BOOT_FILENAME: z.string(),

  TFTP_ROOT: z.string(),
});

export type { ConfigInput };
export { configInput };

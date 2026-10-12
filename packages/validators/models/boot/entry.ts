import z from "zod";
import { bootImage } from "@/models/boot/image";

type BootEntry = z.infer<typeof bootEntry>;

const bootEntry = z.object({
  id: z.string(),
  name: z.string(),
  kernel: bootImage,
  images: z.array(bootImage),
  version: z.number(),
});

export type { BootEntry };
export { bootEntry };

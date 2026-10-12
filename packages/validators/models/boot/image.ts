import z from "zod";

type BootImage = z.infer<typeof bootImage>;

const bootImage = z.object({
  name: z.string(),
  path: z.string(),
  args: z.array(z.string()),
});

export type { BootImage };
export { bootImage };

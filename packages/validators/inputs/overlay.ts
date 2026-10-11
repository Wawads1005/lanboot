import z from "zod";

type CreateOverlayInput = z.infer<typeof createOverlayInput>;

const createOverlayInput = z.object({
  macAddress: z
    .mac({ delimiter: ":" })
    .transform((input) => input.replaceAll(":", "").toLowerCase()),
});

export type { CreateOverlayInput };
export { createOverlayInput };

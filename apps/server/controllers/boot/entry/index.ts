import { BootError, getBootEntries } from "@/lib/boot";
import config from "@/lib/config";
import type e from "express";

async function getEntries(_: e.Request, res: e.Response) {
  try {
    const bootEntries = await getBootEntries(config.api.staticPath);

    res.status(200).json({ entries: bootEntries });
  } catch (error) {
    if (error instanceof BootError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    if (error instanceof Error) {
      res.status(500).json({ message: error.message });
    }

    const message = "Unexpected error occurred upon getting boot entries";

    res.status(500).json({ message });
  }
}

export { getEntries };

import { BootError, getBootEntries } from "@/lib/boot";
import type e from "express";

async function getEntries(_: e.Request, res: e.Response) {
  try {
    const bootEntries = await getBootEntries();

    res.status(200).json({ entries: bootEntries });
  } catch (error) {
    if (error instanceof BootError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    if (error instanceof Error) {
      res.status(500).json({ message: error.message });
      return;
    }

    const message = "Unexpected error occurred upon getting boot entries";

    res.status(500).json({ message });
  }
}

interface GetEntryParams {
  id: string;
}

async function getEntry(req: e.Request<GetEntryParams>, res: e.Response) {
  try {
    const bootEntries = await getBootEntries();

    const foundBootEntry = bootEntries.find(
      (bootEntry) => bootEntry.id === req.params.id,
    );

    if (!foundBootEntry) {
      throw new BootError("Boot entry doesn't exists", { status: 404 });
    }

    res.status(200).json({ bootEntry: foundBootEntry });
  } catch (error) {
    if (error instanceof BootError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    if (error instanceof Error) {
      res.status(500).json({ message: error.message });
      return;
    }

    const message = "Unexpected error occurred upon getting boot entry";

    res.status(500).json({ message });
  }
}

export { getEntries, getEntry };

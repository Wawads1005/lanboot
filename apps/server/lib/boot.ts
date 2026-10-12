import { bootEntry, type BootEntry } from "@lanboot/validators";
import fsPromises from "node:fs/promises";
import path from "node:path";

async function getBootEntries(staticPath: string) {
  const dirents = await fsPromises.readdir(staticPath, { withFileTypes: true });
  const directories = dirents.filter((dirent) => dirent.isDirectory());
  const bootEntries: BootEntry[] = [];

  for (const directory of directories) {
    const dirents = await fsPromises.readdir(
      path.resolve(directory.parentPath, directory.name),
      { withFileTypes: true },
    );

    const foundMeta = dirents.find((dirent) => dirent.name === "metadata.json");

    if (!foundMeta) {
      continue;
    }

    const metadata = JSON.parse(
      await fsPromises.readFile(
        path.resolve(foundMeta.parentPath, foundMeta.name),
        "utf-8",
      ),
    );

    const parseResult = await bootEntry.safeParseAsync(metadata);

    if (!parseResult.success) {
      const message = parseResult.error.issues
        .map((issue) => issue.message)
        .join(",");

      throw new Error(message);
    }

    bootEntries.push(parseResult.data);
  }

  return bootEntries;
}

export { getBootEntries };

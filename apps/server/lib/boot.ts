import type e from "express";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { iPXE } from "@lanboot/ipxe";
import { bootEntry, type BootEntry } from "@lanboot/validators";

interface BootErrorOptions extends ErrorOptions {
  status?: number;
}

class BootError extends Error {
  status: number;

  constructor(message: string, options?: BootErrorOptions) {
    super(message, options);
    this.status = options?.status ?? 500;
  }
}

function sendResponse(res: e.Response, error: Error, status?: number): void;
function sendResponse(res: e.Response, ipxe: iPXE): void;
function sendResponse(res: e.Response, data: Error | iPXE, status = 500) {
  if (data instanceof iPXE) {
    res.contentType("text/plain").status(200).send(data.build());
    return;
  }

  const ipxe = new iPXE();
  ipxe.echo(undefined, `Lanboot: ${data.name}: ${data.message}`);

  res.contentType("text/plain").status(status).send(ipxe.build());
}

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

      throw new BootError(message);
    }

    bootEntries.push(parseResult.data);
  }

  return bootEntries;
}

export type { BootErrorOptions };
export { BootError, sendResponse, getBootEntries };

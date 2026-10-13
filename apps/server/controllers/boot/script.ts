import type e from "express";
import { interpolate, iPXE, metaKey } from "@lanboot/ipxe";
import config from "@/lib/config";
import { BootError, getBootEntries, sendResponse } from "@/lib/boot";

async function scriptHandler(_: e.Request, res: e.Response) {
  try {
    const serverURL = interpolate`http://${"next-server"}:${config.api.port}`;
    const ipxe = new iPXE();
    const bootEntries = await getBootEntries();

    ipxe.ifconf();
    ipxe.set("next-server", config.network.address);
    ipxe.set("keep-san", 1);

    ipxe
      .prompt(
        { key: metaKey.f12, timeout: 5000 },
        "Press F12 to open Lanboot Menu",
      )
      .then((ipxe) => ipxe.goto("start"))
      .catch((ipxe) => ipxe.goto("overlay"));

    ipxe.label("start", (ipxe) => {
      ipxe.menu(undefined, "Lanboot - Menu");
      ipxe.item({ key: "b" }, "boot", "Boot");
      ipxe.item({ key: metaKey.ctrlB }, "shell", "iPXE Shell");
      ipxe.item({ key: "p" }, "poweroff", "Poweroff");

      ipxe
        .choose({ default: "boot", timeout: 3000 }, "operation")
        .then((ipxe) => ipxe.goto("${operation}"))
        .catch((ipxe) => ipxe.goto("shell"));
    });

    ipxe.label("boot", (ipxe) => {
      ipxe.menu(undefined, "Lanboot - Boot");
      ipxe.item({ key: "e" }, "entry", "Entry");
      ipxe.item({ key: "i" }, "iscsi", "iSCSI");
      ipxe.item({ key: "b" }, "start", "Go Back");

      ipxe
        .choose(undefined, "target")
        .then((ipxe) => ipxe.goto("${target}"))
        .catch((ipxe) => ipxe.goto("boot"));
    });

    ipxe.label("entry", (ipxe) => {
      ipxe.menu(undefined, "Lanboot - Boot an Entry");

      for (const bootEntry of bootEntries) {
        ipxe.item(undefined, bootEntry.id, bootEntry.name);
      }

      ipxe.item({ key: "b" }, "boot", "Go Back");
      ipxe
        .choose(undefined, "entry")
        .then((ipxe) => ipxe.goto("${entry}"))
        .catch((ipxe) => ipxe.goto("entry"));
    });

    for (const bootEntry of bootEntries) {
      ipxe.label(bootEntry.id, (ipxe) => {
        ipxe.set("next-server", config.network.address);
        ipxe.set("keep-san", 1);

        const masterIscsi = interpolate`iscsi:${"next-server"}::::${config.lio.iscsi.prefix}:${config.storage.master.name}`;

        ipxe.sanhook({ drive: "0x80" }, masterIscsi);

        const entryURL = `${serverURL}/${bootEntry.id}`;
        const kernelURL = `${entryURL}/${bootEntry.kernel.path}`;

        ipxe.imgload(
          { name: bootEntry.kernel.name },
          kernelURL,
          ...bootEntry.kernel.args,
        );

        for (const image of bootEntry.images) {
          const imageURL = `${entryURL}/${image.path}`;

          ipxe.imgfetch({ name: image.name }, imageURL, ...image.args);
        }
        ipxe.imgexec();
      });
    }

    ipxe.label("iscsi", (ipxe) => {
      ipxe.menu(undefined, "Lanboot - iSCSI");
      ipxe.item({ key: "m" }, "master", "Master");
      ipxe.item({ key: "o" }, "overlay", "Overlay");
      ipxe.item({ key: "b" }, "boot", "Go Back");

      ipxe
        .choose(undefined, "target")
        .then((ipxe) => ipxe.goto("${target}"))
        .catch((ipxe) => ipxe.goto("iscsi"));
    });

    ipxe.label("master", (ipxe) => {
      ipxe.sanhook(
        { drive: "0x80" },
        interpolate`iscsi:${"next-server"}::::${config.lio.iscsi.prefix}:${config.storage.master.name}`,
      );

      ipxe.sanboot({ drive: "0x80" });
    });

    ipxe.label("overlay", (ipxe) => {
      ipxe.params({ method: "POST" });
      ipxe.param(undefined, "macAddress", interpolate`${"mac"}`);

      ipxe.imgexec(undefined, `${serverURL}/api/boot##params`);
    });

    ipxe.label("shell", (ipxe) => {
      ipxe.echo(undefined, "Lanboot - iPXE Shell");

      ipxe.shell();
    });

    ipxe.label("poweroff", (ipxe) => {
      ipxe.echo(undefined, "shutting down...");

      ipxe.poweroff();
    });

    sendResponse(res, ipxe);
  } catch (error) {
    if (error instanceof BootError) {
      sendResponse(res, error, error.status);
      return;
    }

    if (error instanceof Error) {
      sendResponse(res, error);
      return;
    }

    const message = "Unexpected error occurred upon booting.";

    sendResponse(res, new Error(message));
  }
}

export { scriptHandler };

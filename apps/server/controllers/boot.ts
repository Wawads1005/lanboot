import { getBootEntries } from "@/lib/boot";
import config from "@/lib/config";
import { interpolate, iPXE, metaKey } from "@lanboot/ipxe";
import { LIO } from "@lanboot/lio";
import { storage } from "@lanboot/storage";
import { createOverlayInput } from "@lanboot/validators";
import type e from "express";

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

async function bootHandler(req: e.Request, res: e.Response) {
  const method = req.method.toLowerCase();
  const serverURL = interpolate`http://${"next-server"}:${config.api.port}`;

  switch (method) {
    case "get": {
      try {
        const ipxe = new iPXE();
        const bootEntries = await getBootEntries(config.api.staticPath);

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
        if (error instanceof Error) {
          sendResponse(res, error);
          return;
        }

        const message = "Unexpected error occurred upon getting boot entries.";

        sendResponse(res, new Error(message));
      }
      break;
    }
    case "post": {
      try {
        const parseInput = await createOverlayInput.safeParseAsync(req.body);

        if (!parseInput.success) {
          const message = parseInput.error.issues
            .map((issue) => issue.message)
            .join(" ");

          throw new Error(message);
        }

        const overlayIscsi = `${config.lio.iscsi.prefix}:overlay-${parseInput.data.macAddress}`;
        const overlayBlockstoresBlock = `overlay-${parseInput.data.macAddress}`;
        const overlayBlock = `overlay-${parseInput.data.macAddress}`;
        const overlayDevice = `/dev/${config.storage.pool}/overlay-${parseInput.data.macAddress}`;

        const lio = new LIO();

        const foundIscsi = await lio.iscsi.get({ wwn: overlayIscsi });

        if (foundIscsi) {
          const activeSessions = await foundIscsi.session.count();

          if (activeSessions > 0) {
            throw new Error("An active session exists");
          }

          await lio.iscsi.delete(foundIscsi);
        }

        const foundBackstoresBlock = await lio.backstores.block.get({
          name: overlayBlockstoresBlock,
        });

        if (foundBackstoresBlock) {
          await lio.backstores.block.delete(foundBackstoresBlock);
        }

        const foundBlock = await storage.block.findOne(
          config.storage.pool,
          overlayBlock,
        );

        if (foundBlock) {
          await storage.block.delete(config.storage.pool, foundBlock.lv_name);
        }

        await storage.block.create({
          name: overlayBlock,
          pool: config.storage.pool,
          size: config.storage.overlay.size,
          origin: config.storage.master.name,
        });

        const backstoresBlock = await lio.backstores.block.create({
          name: overlayBlockstoresBlock,
          dev: overlayDevice,
          readOnly: false,
        });

        const iscsi = await lio.iscsi.create({ wwn: overlayIscsi });
        let tpg1 = await iscsi.tpg.get(1);

        if (!tpg1) {
          tpg1 = await iscsi.tpg.create(1);
        }

        let lun0 = await tpg1.lun.get(0);

        if (!lun0) {
          lun0 = await tpg1.lun.create(0, backstoresBlock);
        }

        await tpg1.attrib.set("authentication", false);
        await tpg1.attrib.set("demo_mode_write_protect", false);
        await tpg1.attrib.set("prod_mode_write_protect", false);
        await tpg1.attrib.set("generate_node_acls", true);
        await tpg1.attrib.set("cache_dynamic_acls", true);

        await tpg1.portal.create();

        const ipxe = new iPXE();

        ipxe.ifconf();
        ipxe.set("next-server", config.network.address);
        ipxe.set("keep-san", 1);

        ipxe.sanhook(
          { drive: "0x80" },
          interpolate`iscsi:${"next-server"}::::${overlayIscsi}`,
        );

        ipxe.sanboot({ drive: "0x80" });

        sendResponse(res, ipxe);
        break;
      } catch (error) {
        if (error instanceof Error) {
          sendResponse(res, error);
          break;
        }

        const message = "Unexpected error occurred upon creating an overlay";

        sendResponse(res, new Error(message));
        break;
      }
    }
    default: {
      sendResponse(res, new Error("Unknown boot path"), 404);
      break;
    }
  }
}

export default bootHandler;

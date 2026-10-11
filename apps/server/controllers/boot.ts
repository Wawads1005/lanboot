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
  const httpURL = interpolate`http://${"next-server"}:${config.api.port}`;

  switch (method) {
    case "get": {
      const ipxe = new iPXE();

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
        ipxe.item(
          { key: "i", gap: true },
          "install",
          "Install an Operating System",
        );
        ipxe.item({ key: "b", gap: true }, "boot", "Boot from iSCSI");
        ipxe.item({ key: metaKey.ctrlB, gap: true }, "shell", "iPXE Shell");
        ipxe.item({ key: "p", gap: true }, "poweroff", "Poweroff");

        ipxe
          .choose({ default: "boot", timeout: 3000 }, "operation")
          .then((ipxe) => ipxe.goto("${operation}"))
          .catch((ipxe) => ipxe.goto("shell"));
      });

      ipxe.label("install", (ipxe) => {
        ipxe.menu(undefined, "Lanboot - Install an Operating System");
        ipxe.item({ key: "w", gap: true }, "windows", "Install Windows");
        ipxe.item({ key: "b", gap: true }, "start", "Go Back");

        ipxe
          .choose(undefined, "operating_system")
          .then((ipxe) => ipxe.goto("${operating_system}"))
          .catch((ipxe) => ipxe.goto("install"));
      });

      ipxe.label("windows", (ipxe) => {
        ipxe.menu(undefined, "Lanboot - Install Windows");
        ipxe.item({ key: "0", gap: true }, "windows_10", "Windows 10");
        ipxe.item({ key: "b", gap: true }, "install", "Go Back");

        ipxe
          .choose(undefined, "windows_version")
          .then((ipxe) => ipxe.goto("${windows_version}"))
          .catch((ipxe) => ipxe.goto("windows"));
      });

      ipxe.label("windows_10", (ipxe) => {
        ipxe.sanhook(
          { drive: "0x80" },
          interpolate`iscsi:${"next-server"}::::${config.lio.iscsi.prefix}:master`,
        );

        ipxe.imgload(
          undefined,
          `${httpURL}/windows/winpe/wimboot`,
          "index=1",
          "gui",
        );
        ipxe.imgfetch(undefined, `${httpURL}/windows/winpe/boot/BCD`);
        ipxe.imgfetch(undefined, `${httpURL}/windows/winpe/boot/boot.sdi`);
        ipxe.imgfetch(undefined, `${httpURL}/windows/winpe/sources/boot.wim`);

        ipxe.imgexec();
      });

      ipxe.label("boot", (ipxe) => {
        ipxe.menu(undefined, "Lanboot - Boot from iSCSI");
        ipxe.item({ key: "m", gap: true }, "master", "Master");
        ipxe.item({ key: "o", gap: true }, "overlay", "Overlay");
        ipxe.item({ key: "b", gap: true }, "start", "Go Back");

        ipxe
          .choose({ default: "overlay", timeout: 2000 }, "image")
          .then((ipxe) => ipxe.goto("${image}"))
          .catch((ipxe) => ipxe.goto("boot"));
      });

      ipxe.label("master", (ipxe) => {
        ipxe.sanhook(
          { drive: "0x80" },
          interpolate`iscsi:${"next-server"}::::${config.lio.iscsi.prefix}:master`,
        );

        ipxe.sanboot({ drive: "0x80" });
      });

      ipxe.label("overlay", (ipxe) => {
        ipxe.params({ method: "POST" });
        ipxe.param(undefined, "macAddress", interpolate`${"mac"}`);

        ipxe.imgexec(undefined, `${httpURL}/api/boot##params`);
      });

      sendResponse(res, ipxe);
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

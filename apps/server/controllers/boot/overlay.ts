import type e from "express";
import { storage } from "@lanboot/storage";
import { createOverlayInput } from "@lanboot/validators";
import { interpolate, iPXE } from "@lanboot/ipxe";
import lio from "@/lib/lio";
import config from "@/lib/config";
import { BootError, sendResponse } from "@/lib/boot";

async function overlayHandler(req: e.Request, res: e.Response) {
  try {
    const parseInput = await createOverlayInput.safeParseAsync(req.body);

    if (!parseInput.success) {
      const message = parseInput.error.issues
        .map((issue) => issue.message)
        .join(",");

      throw new BootError(message, { status: 400 });
    }

    const overlayLioIscsiTarget = config.overlay.lio.iscsi.target(
      parseInput.data.macAddress,
    );
    const overlayLioBlockstoresBlockName =
      config.overlay.lio.backstores.block.name(parseInput.data.macAddress);
    const overlayStorageBlockName = config.overlay.storage.block.name(
      parseInput.data.macAddress,
    );
    const overlayStorageBlockPath = config.overlay.storage.block.path(
      parseInput.data.macAddress,
    );

    const foundOverlayLioIscsi = await lio.iscsi.get({
      wwn: overlayLioIscsiTarget,
    });

    if (foundOverlayLioIscsi) {
      const activeSessions = await foundOverlayLioIscsi.session.count();

      if (activeSessions > 0) {
        throw new BootError("An active session exists", { status: 409 });
      }

      await lio.iscsi.delete(foundOverlayLioIscsi);
    }

    const foundOverlayBackstoresBlock = await lio.backstores.block.get({
      name: overlayLioBlockstoresBlockName,
    });

    if (foundOverlayBackstoresBlock) {
      await lio.backstores.block.delete(foundOverlayBackstoresBlock);
    }

    const foundBlock = await storage.block.findOne(
      config.storage.pool.name,
      overlayStorageBlockName,
    );

    if (foundBlock) {
      await storage.block.delete(config.storage.pool.name, foundBlock.lv_name);
    }

    await storage.block.create({
      name: overlayStorageBlockName,
      pool: config.storage.pool.name,
      size: config.overlay.storage.block.size,
      origin: config.master.storage.block.name,
    });

    const overlayLioBackstoresBlock = await lio.backstores.block.create({
      name: overlayLioBlockstoresBlockName,
      dev: overlayStorageBlockPath,
      readOnly: false,
    });

    const overlayLioIscsi = await lio.iscsi.create({
      wwn: overlayLioIscsiTarget,
    });
    const overlayLioIscsiTpg1 = await overlayLioIscsi.tpg.create(1, {
      enable: false,
    });

    await overlayLioIscsiTpg1.lun.create(0, overlayLioBackstoresBlock);
    await overlayLioIscsiTpg1.attrib.update({
      authentication: false,
      demo_mode_write_protect: false,
      prod_mode_write_protect: false,
      generate_node_acls: true,
      cache_dynamic_acls: true,
    });

    await overlayLioIscsiTpg1.portal.create();
    await overlayLioIscsiTpg1.enable();

    const ipxe = new iPXE();

    ipxe.ifconf();
    ipxe.set("next-server", config.network.address);
    ipxe.set("keep-san", 1);

    ipxe.sanhook(
      { drive: "0x80" },
      interpolate`iscsi:${"next-server"}::::${overlayLioIscsiTarget}`,
    );

    ipxe.sanboot({ drive: "0x80" });

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

    const message = "Unexpected error occurred upon creating an overlay";

    sendResponse(res, new Error(message));
  }
}

export { overlayHandler };

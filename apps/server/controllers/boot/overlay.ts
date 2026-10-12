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

    const overlayIscsi = `${config.lio.iscsi.prefix}:overlay-${parseInput.data.macAddress}`;
    const overlayBlockstoresBlock = `overlay-${parseInput.data.macAddress}`;
    const overlayBlock = `overlay-${parseInput.data.macAddress}`;
    const overlayDevice = `/dev/${config.storage.pool}/overlay-${parseInput.data.macAddress}`;

    const foundIscsi = await lio.iscsi.get({ wwn: overlayIscsi });

    if (foundIscsi) {
      const activeSessions = await foundIscsi.session.count();

      if (activeSessions > 0) {
        throw new BootError("An active session exists", { status: 409 });
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
    const tpg1 = await iscsi.tpg.create(1, { enable: false });

    await tpg1.lun.create(0, backstoresBlock);
    await tpg1.attrib.update({
      authentication: false,
      demo_mode_write_protect: false,
      prod_mode_write_protect: false,
      generate_node_acls: true,
      cache_dynamic_acls: true,
    });

    await tpg1.portal.create();
    await tpg1.enable();

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

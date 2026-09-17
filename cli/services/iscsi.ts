import { LanbootConfiguration } from "@/schemas/lanboot";
import {
  createStorageBackstores,
  createStorageBlock,
  createStorageTarget,
  createStorageTargetLun,
  getStorageBackstores,
  getStorageBlock,
  getStorageTarget,
  getStorageTargetLun,
  getStoragetTargetAttribute,
  setStorageTargetAttribute,
} from "@/services/internal";

async function configureiSCSI(configuration: LanbootConfiguration) {
  const { storage: storageConfig, image: imageConfig } = configuration;

  const masterStorageBlockPath = `/dev/${storageConfig.pool}/${imageConfig.master}`;

  const masterStorageBlock = await getStorageBlock({
    path: masterStorageBlockPath,
  });

  if (!masterStorageBlock.ok) {
    await createStorageBlock({
      pool: storageConfig.pool,
      options: {
        type: "linear",
        name: imageConfig.master,
        size: imageConfig.masterSize,
        path: masterStorageBlockPath,
      },
    });
  }

  const masterStorageBackstores = await getStorageBackstores({
    name: imageConfig.master,
  });

  if (!masterStorageBackstores.ok) {
    await createStorageBackstores({
      device: masterStorageBlockPath,
      name: imageConfig.master,
    });
  }

  const masterIqn = `${imageConfig.iqnPrefix}:${imageConfig.master}`;

  const masterStorageTarget = await getStorageTarget({
    wwn: masterIqn,
  });

  if (!masterStorageTarget.ok) {
    await createStorageTarget({ wwn: masterIqn });
  }

  const masterStorageTargetLun = await getStorageTargetLun({
    lun: 0,
    wwn: masterIqn,
  });

  if (!masterStorageTargetLun.ok) {
    await createStorageTargetLun({
      wwn: masterIqn,
      lun: 0,
      storageObject: `/backstores/block/${imageConfig.master}`,
    });
  }

  const authentication = await getStoragetTargetAttribute({
    wwn: masterIqn,
    attribute: "authentication",
  });

  if (parseInt(authentication.stdout.trim().split("=").pop()!, 10) === 1) {
    await setStorageTargetAttribute({
      wwn: masterIqn,
      attribute: "authentication",
      value: 0,
    });
  }

  const demoModeWriteProtect = await getStoragetTargetAttribute({
    wwn: masterIqn,
    attribute: "demo_mode_write_protect",
  });

  if (
    parseInt(demoModeWriteProtect.stdout.trim().split("=").pop()!, 10) === 1
  ) {
    await setStorageTargetAttribute({
      wwn: masterIqn,
      attribute: "demo_mode_write_protect",
      value: 0,
    });
  }

  const prodModeWriteProtect = await getStoragetTargetAttribute({
    wwn: masterIqn,
    attribute: "prod_mode_write_protect",
  });

  if (
    parseInt(prodModeWriteProtect.stdout.trim().split("=").pop()!, 10) === 1
  ) {
    await setStorageTargetAttribute({
      wwn: masterIqn,
      attribute: "prod_mode_write_protect",
      value: 0,
    });
  }

  const generateNodeACLS = await getStoragetTargetAttribute({
    wwn: masterIqn,
    attribute: "generate_node_acls",
  });

  if (parseInt(generateNodeACLS.stdout.trim().split("=").pop()!, 10) === 0) {
    await setStorageTargetAttribute({
      wwn: masterIqn,
      attribute: "generate_node_acls",
      value: 1,
    });
  }
}

export { configureiSCSI };

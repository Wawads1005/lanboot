import { LanbootConfiguration } from "@/schemas/lanboot";
import {
  createStorage,
  createStoragePool,
  getStorage,
  getStoragePool,
} from "@/services/internal";

async function configureStorage(configuration: LanbootConfiguration) {
  const { storage: storageConfig } = configuration;

  const storagePool = await getStoragePool({
    path: `/dev/${storageConfig.pool}`,
  });

  if (!storagePool.ok) {
    for await (const device of storageConfig.devices) {
      const storage = await getStorage({ device });

      if (!storage.ok) {
        await createStorage({ devices: storageConfig.devices });
      }
    }

    await createStoragePool({
      devices: storageConfig.devices,
      name: storageConfig.pool,
    });
  }
}

export { configureStorage };

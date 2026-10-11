import { $ } from "zx";
import type { LVMResponse } from "@/types/lvm";

interface CreatePoolInput {
  name: string;
  devices: string[];
}

interface UpdatePoolInput {
  addDevices?: string[];
}

interface CreateBlockInput {
  name: string;
  pool: string;
  size: string;
  origin?: string;
}

interface UpdateBlockInput {
  name?: string;
  size?: string;
}

const storage = {
  device: {
    async findMany() {
      const response = await $`pvs --reportformat json_std`.json<
        LVMResponse<"pv">
      >();

      return response.report.flatMap((report) => report.pv);
    },

    async findOne(name: string) {
      const devices = await this.findMany();
      const foundDevice = devices.find((device) => device.pv_name === name);

      return foundDevice;
    },

    async create(name: string) {
      let foundDevice = await this.findOne(name);

      if (foundDevice) {
        return foundDevice;
      }

      await $`pvcreate ${name} -y`;
      foundDevice = await this.findOne(name);

      if (!foundDevice) {
        throw new Error("Unexpected error occured upon creating a device.");
      }

      return foundDevice;
    },

    async delete(name: string) {
      const device = await this.findOne(name);

      if (!device) {
        return;
      }

      if (device.vg_name) {
        throw new Error(
          `Cannot remove ${name}: it belongs to VG ${device.vg_name}`,
        );
      }

      await $`pvremove ${name} -y`;
    },
  },

  pool: {
    async findMany() {
      const response = await $`vgs --reportformat json_std`.json<
        LVMResponse<"vg">
      >();

      return response.report.flatMap((report) => report.vg);
    },

    async findOne(name: string) {
      const pools = await this.findMany();
      const foundPool = pools.find((pool) => pool.vg_name === name);

      return foundPool;
    },

    async create(input: CreatePoolInput) {
      if (await this.findOne(input.name)) {
        throw new Error(`VG already exists: ${input.name}`);
      }

      if (input.devices.length === 0) {
        throw new Error("A pool requires at least one device");
      }

      for (const name of input.devices) {
        const device = await storage.device.findOne(name);

        if (!device) {
          throw new Error(`Device is not an LVM PV: ${name}`);
        }

        if (device.vg_name) {
          throw new Error(
            `Device ${name} already belongs to VG ${device.vg_name}`,
          );
        }
      }

      await $`vgcreate ${input.name} ${input.devices}`;
      return this.findOne(input.name);
    },

    async update(name: string, input: UpdatePoolInput) {
      const pool = await this.findOne(name);

      if (!pool) {
        throw new Error(`VG not found: ${name}`);
      }

      const devices = input.addDevices ?? [];

      for (const deviceName of devices) {
        const device = await storage.device.findOne(deviceName);

        if (!device) {
          throw new Error(`Device is not an LVM PV: ${deviceName}`);
        }

        if (device.vg_name) {
          throw new Error(
            `Device ${deviceName} already belongs to VG ${device.vg_name}`,
          );
        }
      }

      if (devices.length > 0) {
        await $`vgextend ${name} ${devices}`;
      }

      return this.findOne(name);
    },

    async delete(name: string) {
      const pool = await this.findOne(name);

      if (!pool) {
        return;
      }

      if (pool.lv_count > 0) {
        throw new Error(
          `Cannot remove VG ${name}: it contains ${pool.lv_count} logical volume(s)`,
        );
      }

      await $`vgremove ${name} -y`;
    },
  },

  block: {
    async findMany() {
      const response = await $`lvs --reportformat json_std`.json<
        LVMResponse<"lv">
      >();

      return response.report.flatMap((report) => report.lv);
    },

    async findOne(pool: string, name: string) {
      const blocks = await this.findMany();
      const foundBlock = blocks.find(
        (block) => block.lv_name === name && block.vg_name === pool,
      );

      return foundBlock;
    },

    async create(input: CreateBlockInput) {
      const foundPool = await storage.pool.findOne(input.pool);

      if (!foundPool) {
        throw new Error(`VG not found: ${input.pool}`);
      }

      let foundBlock = await this.findOne(input.pool, input.name);

      if (foundBlock) {
        throw new Error(`LV already exists: ${input.pool}/${input.name}`);
      }

      if (input.origin) {
        const origin = await this.findOne(input.pool, input.origin);

        if (!origin) {
          throw new Error(`Origin LV not found: ${input.pool}/${input.origin}`);
        }

        await $`lvcreate --type snapshot --size ${input.size} --name ${input.name} ${input.pool}/${input.origin}`;
      } else {
        await $`lvcreate --type linear --size ${input.size} --name ${input.name} ${input.pool}`;
      }

      foundBlock = await this.findOne(input.pool, input.name);

      if (!foundBlock) {
        throw new Error("Unexpected error occured upon creating block");
      }

      return foundBlock;
    },

    async update(pool: string, name: string, input: UpdateBlockInput) {
      const block = await this.findOne(pool, name);

      if (!block) {
        throw new Error(`LV not found: ${pool}/${name}`);
      }

      if (input.size) {
        await $`lvresize --size ${input.size} ${pool}/${name}`;
      }

      if (input.name && input.name !== name) {
        await $`lvrename ${pool} ${name} ${input.name}`;
      }

      return this.findOne(pool, input.name ?? name);
    },

    async delete(pool: string, name: string) {
      const block = await this.findOne(pool, name);

      if (!block) {
        return;
      }

      await $`lvremove ${pool}/${name} -y`;
    },
  },
};

export { storage };

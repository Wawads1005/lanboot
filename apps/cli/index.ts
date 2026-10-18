import fsPromises from "node:fs/promises";
import { $ } from "zx";
import { checkbox, confirm, input, number, select } from "@inquirer/prompts";
import { Command } from "commander";
import { configInput, type ConfigInput } from "@lanboot/validators";
import { detectBlockdevices, detectInterfaces } from "@/lib/utils";
import { dependencies } from "@/lib/dependencies";
import { loadModules } from "@/lib/modules";
import { loadConfiguration } from "@/lib/configuration";
import { generator } from "@/commands/generator";
import {
  SERVER_DIRECTORY,
  SERVER_FILEPATH,
  CONFIG_FILEPATH,
  SERVICE_FILEPATH,
  SERVICE_NAME,
} from "@lanboot/core";

const lanboot = new Command("lanboot");
const packages = dependencies.flatMap((dependency) => dependency.package);
const services = dependencies.flatMap((dependency) => dependency.services);

lanboot
  .command("install")
  .description("install dependencies")
  .action(async () => {
    console.log(`Installing dependencies...`);
    await $`apt-get install ${packages} -y`;
    console.log(`Successfully installed dependencies...`);

    await $`systemctl stop ${services}`;
    await $`systemctl disable ${services}`;

    await loadModules();

    const system: Array<string | undefined> = [
      "[Unit]",
      "Description=Lanboot - Diskless boot server",
      `After=network-online.target sys-kernel-config.mount ${services.join(" ")}`,
      `Wants=network-online.target ${services.join(" ")}`,
      undefined,
      "[Service]",
      `WorkingDirectory=${SERVER_DIRECTORY}`,
      `EnvironmentFile=${CONFIG_FILEPATH}`,
      "Type=simple",
      `ExecStart=${process.execPath} ${SERVER_FILEPATH}`,
      undefined,
      "[Install]",
      "WantedBy=multi-user.target",
    ];

    const result = await $`systemctl cat ${SERVICE_NAME}.service`.nothrow();

    if (result.ok) {
      await $`systemctl stop ${SERVICE_NAME}.service`;
      await $`systemctl disable ${SERVICE_NAME}.service`;
    }

    try {
      await fsPromises.rm(SERVER_DIRECTORY, { recursive: true });
    } catch (error) {
      /**Best effort */
    }

    await $`pnpm -F @lanboot/server build`;
    await $`pnpm -F @lanboot/server deploy --prod ${SERVER_DIRECTORY}`;

    await fsPromises.writeFile(SERVICE_FILEPATH, system.join("\n"));

    await $`systemctl daemon-reload`;
  });

lanboot
  .command("configure")
  .description("configuration setup")
  .action(async () => {
    const networkInterfaces = detectInterfaces();
    const allBlockdevices = await detectBlockdevices();

    if (allBlockdevices.length === 0) {
      throw new Error("Need atleast 1 blockdevice");
    }

    const networkInterface = await select({
      message: "Select a Network Interface:",
      choices: networkInterfaces,
    });

    const serverPort = await number({
      message: "Enter your Server Port:",
      default: 8080,
      required: true,
    });

    const devices = await checkbox({
      message: "Check every blockdevices lanboot is allowed to use:",
      choices: allBlockdevices.map((blockdevice) => {
        return {
          checked: true,
          name: blockdevice.model,
          value: blockdevice.path,
        };
      }),
    });

    const storageMasterSize = await input({
      message: "Enter your Storage Master Size:",
      default: "64G",
      required: true,
    });

    const storageOverlaySize = await input({
      message: "Enter your Storage Overlay Size:",
      default: "24G",
      required: true,
    });

    const bootFirmware = await select({
      message: "Select a firmware:",
      choices: [{ value: "bios" }, { value: "uefi", disabled: true }],
      default: "bios",
    });

    const bootFilename = await input({
      message: "Enter your Boot Filename",
      default: "lanboot.kpxe",
      required: true,
    });

    const tftpRoot = await input({
      message: "Enter your TFTP root:",
      default: "/srv/tftp",
      required: true,
    });

    const config: ConfigInput = {
      SERVER_PORT: serverPort,
      NETWORK_INTERFACE: networkInterface,
      BOOT_FIRMWARE: bootFirmware,
      BOOT_FILENAME: bootFilename,
      TFTP_ROOT: tftpRoot,
      STORAGE_DEVICES: devices,
      STORAGE_MASTER_SIZE: storageMasterSize,
      STORAGE_OVERLAY_SIZE: storageOverlaySize,
    };

    const parseResult = await configInput.safeParseAsync(config);

    if (!parseResult.success) {
      throw new Error(
        parseResult.error.issues[0]
          ? parseResult.error.issues[0].message
          : parseResult.error.message,
      );
    }

    const content = Object.entries(parseResult.data).map(([key, value]) => {
      const data = Array.isArray(value) ? value.join(",") : String(value);

      return `${key}=${data}`;
    });

    console.log(content.join("\n"));

    const save = await confirm({
      message: "Save configuration?",
      default: true,
    });

    if (!save) {
      process.exit(0);
    }

    for await (const dependency of dependencies) {
      console.log(`Configuring ${dependency.package}...`);
      await dependency.configurator(parseResult.data);
      console.log(`Successfully configure ${dependency.package}.`);
    }

    await fsPromises.writeFile(CONFIG_FILEPATH, content.join("\n"));
  });

lanboot
  .command("start")
  .description("start lanboot")
  .action(async () => {
    await loadConfiguration();

    await $`systemctl start ${[...services, `${SERVICE_NAME}.service`]}`;
    await $`systemctl enable ${[...services, `${SERVICE_NAME}.service`]}`;
  });

lanboot
  .command("stop")
  .description("stop lanboot")
  .action(async () => {
    await $`systemctl stop ${[...services, `${SERVICE_NAME}.service`]}`;
    await $`systemctl disable ${[...services, `${SERVICE_NAME}.service`]}`;
  });

lanboot.addCommand(generator);

async function main() {
  try {
    if (process.argv.length === 2) {
      lanboot.help();
      return;
    }

    await lanboot.parseAsync();
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "ExitPromptError") {
        process.exit(1);
      }

      console.error(`Lanboot: ${error.message}`);
    }

    process.exit(1);
  }
}

main();

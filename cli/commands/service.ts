import {
  defaultConfiguration,
  getConfiguration,
  setConfiguration,
} from "@/lib/configure";
import { LanbootConfigurationSchema } from "@/schemas/lanboot";
import { configureDHCP } from "@/services/dhcp";
import { installServices, startServices } from "@/services/internal";
import { configureLVM } from "@/services/lvm";
import { configureSMB } from "@/services/smb";
import { configureTFTP } from "@/services/tftp";
import { Command, CommanderError } from "commander";

const serviceCLI = new Command("service");

class ServiceError extends CommanderError {
  constructor(message: string) {
    super(1, "service", message);
  }
}

serviceCLI.description("Lanboot service management.");

async function start() {
  const configuration =
    (await getConfiguration()) ??
    (await setConfiguration(defaultConfiguration), defaultConfiguration);

  const configurationResult =
    LanbootConfigurationSchema.safeParse(configuration);

  if (!configurationResult.success) {
    throw new ServiceError(
      configurationResult.error.issues[0]
        ? configurationResult.error.issues[0].message
        : configurationResult.error.message,
    );
  }

  await configureDHCP(configuration);
  await configureTFTP(configuration);
  await configureSMB(configuration);
  await configureLVM(configuration);

  const response = await startServices();

  if (!response.ok) {
    throw new ServiceError(response.stderr.trim());
  }

  console.log("Lanboot started.");
}

serviceCLI
  .command("start")
  .description("Start Lanboot services.")
  .action(start);

serviceCLI
  .command("restart")
  .description("Restart Lanboot services.")
  .action(start);

serviceCLI
  .command("install")
  .description("Install Lanboot services.")
  .action(async () => {
    const response = await installServices();

    if (!response.ok) {
      throw new ServiceError(response.stderr.trim());
    }

    console.log(response.stdout.trim());
  });

export { serviceCLI };

import { getConfiguration } from "@/lib/configure";
import { LanbootConfigurationSchema } from "@/schemas/lanboot";
import { configureDHCP } from "@/services/dhcp";
import { configureSMB } from "@/services/smb";
import { configureTFTP } from "@/services/tftp";
import { Command, CommanderError } from "commander";

const serviceCLI = new Command("service");

class ServiceError extends CommanderError {
  constructor(message: string) {
    super(1, "service", message);
  }
}

serviceCLI.description("Lanboot service management");

serviceCLI.command("configure").action(async () => {
  const foundConfiguration = await getConfiguration();

  if (!foundConfiguration) {
    throw new ServiceError("Lanboot configuration doesn't exists.");
  }

  const configurationResult =
    LanbootConfigurationSchema.safeParse(foundConfiguration);

  if (!configurationResult.success) {
    throw new ServiceError(
      configurationResult.error.issues[0]
        ? configurationResult.error.issues[0].message
        : configurationResult.error.message,
    );
  }

  console.log("Configuring DHCP server...");
  await configureDHCP(configurationResult.data);
  console.log("Successfully configured DHCP server.");

  console.log("Configuring TFTP server...");
  await configureTFTP(configurationResult.data);
  console.log("Successfully configured TFTP server.");

  console.log("Configuring SMB server...");
  await configureSMB(configurationResult.data);
  console.log("Successfully configured SMB server.");
});

export { serviceCLI };

import { Command, CommanderError } from "commander";
import { configureCLI } from "@/commands/configure";
import { serviceCLI } from "@/commands/service";
import { installServices, uninstallServices } from "@/services/internal";

class LanbootError extends CommanderError {
  constructor(message: string) {
    super(1, "lanboot", message);
  }
}

const lanbootCLI = new Command("lanboot");

lanbootCLI
  .command("install")
  .description("Install Lanboot.")
  .action(async () => {
    const response = await installServices();

    if (!response.ok) {
      throw new LanbootError(response.stderr.trim());
    }

    console.log(response.stdout.trim());
  });

lanbootCLI
  .command("uninstall")
  .description("Uninstall Lanboot.")
  .action(async () => await uninstallServices());

lanbootCLI.addCommand(configureCLI);
lanbootCLI.addCommand(serviceCLI);

async function main() {
  try {
    await lanbootCLI.parseAsync(process.argv);

    process.exit(0);
  } catch (error) {
    if (error instanceof CommanderError) {
      console.error(`${error.code}: ${error.message}`);
    } else if (error instanceof Error) {
      console.error(`Lanboot: ${error.message}`);
    }

    process.exit(1);
  }
}

main();

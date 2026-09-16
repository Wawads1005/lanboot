import { Command, CommanderError } from "commander";
import { configureCLI } from "@/commands/configure";
import { serviceCLI } from "@/commands/service";

const lanbootCLI = new Command("lanboot");

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

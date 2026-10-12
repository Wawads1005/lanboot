import { CONFIG_FILEPATH } from "@/constants";
import { configInput } from "@lanboot/validators";

async function loadConfiguration() {
  try {
    process.loadEnvFile(CONFIG_FILEPATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Missing configuration file");
    }

    throw error;
  }

  const parseResult = await configInput.safeParseAsync(process.env);

  if (!parseResult.success) {
    throw new Error(
      parseResult.error.issues[0]
        ? parseResult.error.issues[0].message
        : parseResult.error.message,
    );
  }

  return parseResult.data;
}

export { loadConfiguration };

import fsPromises from "node:fs/promises";
import toml, { stringify, TomlError } from "smol-toml";
import { CONFIG_FILEPATH } from "@/constants/config";
import { LanbootConfiguration } from "@/schemas/lanboot";

async function getHasConfiguration() {
  try {
    await fsPromises.access(CONFIG_FILEPATH, fsPromises.constants.F_OK);

    return true;
  } catch (error) {
    return false;
  }
}

async function getConfiguration() {
  const hasConfiguration = await getHasConfiguration();

  if (!hasConfiguration) {
    return null;
  }

  try {
    const configurationToml = await fsPromises.readFile(
      CONFIG_FILEPATH,
      "utf-8",
    );

    const configuration = toml.parse(configurationToml) as LanbootConfiguration;

    return configuration;
  } catch (error) {
    if (error instanceof TomlError) {
      console.error(`config: ${error.message}`);
    }

    return null;
  }
}

async function setConfiguration(configuration: LanbootConfiguration) {
  const configurationToml = stringify(configuration);

  await fsPromises.writeFile(CONFIG_FILEPATH, configurationToml);
}

export { getConfiguration, setConfiguration };

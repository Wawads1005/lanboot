import { getConfiguration, setConfiguration } from "@/lib/configure";
import {
  LanbootConfiguration,
  LanbootConfigurationSchema,
} from "@/schemas/lanboot";
import { Command, CommanderError } from "commander";
import { stringify } from "smol-toml";

class ConfigurationError extends CommanderError {
  constructor(message: string) {
    super(1, "configuration", message);
  }
}

function createConfigurationObject(
  key: string,
  value: unknown,
): Record<string, unknown> {
  const parts = key.split(".");
  const result: Record<string, unknown> = {};

  let current = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const currentPart = parts[i];
    if (!currentPart) {
      continue;
    }

    current[currentPart] = {};
    current = current[currentPart] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;

  if (!lastPart) {
    return result;
  }

  current[lastPart] = value;

  return result;
}

function getConfigurationValue(
  configuration: LanbootConfiguration,
  key: string,
): unknown {
  const parts = key.split(".");

  let value: unknown = configuration;
  let currentPath = "";

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}.${part}` : part;

    if (Array.isArray(value)) {
      if (!/^\d+$/.test(part)) {
        throw new ConfigurationError(
          `Configuration key "${currentPath}" must use a numeric array index.`,
        );
      }

      const index = Number(part);

      if (index >= value.length) {
        throw new ConfigurationError(
          `Configuration key doesn't exist: ${currentPath}`,
        );
      }

      value = value[index];
      continue;
    }

    if (typeof value !== "object" || value === null || !(part in value)) {
      throw new ConfigurationError(
        `Configuration key doesn't exist: ${currentPath}`,
      );
    }

    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

function setConfigurationValue(
  configuration: LanbootConfiguration,
  key: string,
  value: unknown,
): void {
  const parts = key.split(".");

  let current: unknown = configuration;
  let currentPath = "";

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;

    currentPath = currentPath ? `${currentPath}.${part}` : part;

    if (Array.isArray(current)) {
      if (!/^\d+$/.test(part)) {
        throw new ConfigurationError(
          `Configuration key "${currentPath}" must use a numeric array index.`,
        );
      }

      const index = Number(part);

      if (index >= current.length) {
        throw new ConfigurationError(
          `Configuration key doesn't exist: ${currentPath}`,
        );
      }

      current = current[index];
      continue;
    }

    if (typeof current !== "object" || current === null || !(part in current)) {
      throw new ConfigurationError(
        `Configuration key doesn't exist: ${currentPath}`,
      );
    }

    current = (current as Record<string, unknown>)[part];
  }

  const lastPart = parts[parts.length - 1];

  if (!lastPart) {
    throw new ConfigurationError(`Invalid configuration key: ${key}`);
  }

  currentPath = currentPath ? `${currentPath}.${lastPart}` : lastPart;

  if (Array.isArray(current)) {
    if (!/^\d+$/.test(lastPart)) {
      throw new ConfigurationError(
        `Configuration key "${currentPath}" must use a numeric array index.`,
      );
    }

    const index = Number(lastPart);

    if (index >= current.length) {
      throw new ConfigurationError(
        `Configuration key doesn't exist: ${currentPath}`,
      );
    }

    current[index] = value;
    return;
  }

  if (
    typeof current !== "object" ||
    current === null ||
    !(lastPart in current)
  ) {
    throw new ConfigurationError(
      `Configuration key doesn't exist: ${currentPath}`,
    );
  }

  (current as Record<string, unknown>)[lastPart] = value;
}

function parseConfigurationValue(
  currentValue: unknown,
  value: string,
): unknown {
  switch (typeof currentValue) {
    case "boolean":
      if (value === "true") {
        return true;
      }

      if (value === "false") {
        return false;
      }

      throw new ConfigurationError(`Invalid boolean value: ${value}`);

    case "number": {
      const parsed = Number(value);

      if (Number.isNaN(parsed)) {
        throw new ConfigurationError(`Invalid number value: ${value}`);
      }

      return parsed;
    }

    case "string":
      return value;

    default:
      throw new ConfigurationError(
        "Only scalar configuration values can be set.",
      );
  }
}

const defaultConfiguration: LanbootConfiguration = {
  network: {
    interface: "enp3s0",
    address: "192.168.100.243",
    netmask: "255.255.255.0",
  },

  dhcp: {
    rangeStart: "192.168.100.1",
    rangeEnd: "192.168.100.254",
    proxy: true,
  },

  tftp: {
    enable: true,
    root: "/srv/tftp",
  },

  http: {
    enable: true,
    root: "/var/www/html",
  },

  smb: {
    workgroup: "WORKGROUP",
    serverString: "Lanboot",
    serverRole: "standalone",
    mapToGuest: "bad user",
    shares: [
      {
        name: "shared",
        path: "/srv/samba/shared",
        browseable: true,
        readOnly: false,
        guestOK: true,
        createMask: "0755",
        directoryMask: "0755",
      },
      {
        name: "installation",
        path: "/srv/samba/installation",
        browseable: true,
        readOnly: false,
        guestOK: true,
        createMask: "0755",
        directoryMask: "0755",
      },
    ],
  },
};

const configureCLI = new Command("config");

configureCLI.description("Lanboot configuration management");

configureCLI.command("create").action(async () => {
  const foundConfiguration = await getConfiguration();

  if (foundConfiguration) {
    throw new ConfigurationError("Lanboot configuration already exists.");
  }

  try {
    await setConfiguration(defaultConfiguration);

    console.log("Lanboot configuration creation succeeded.");
  } catch (error) {
    if (error instanceof Error) {
      throw new ConfigurationError(error.message);
    }

    throw new ConfigurationError(
      "Unexpected error occured upon creating a configuration.",
    );
  }
});

configureCLI
  .command("get")
  .description("Read Lanboot configuration value.")
  .argument("[key]", "Lanboot configuration key.")
  .action(async (key: string | undefined) => {
    const foundConfiguration = await getConfiguration();

    if (!foundConfiguration) {
      throw new ConfigurationError(
        "Lanboot configuration doesn't exists, create one by running lanboot config create.",
      );
    }

    const configurationResult =
      LanbootConfigurationSchema.safeParse(foundConfiguration);

    if (!configurationResult.success) {
      throw new ConfigurationError(
        configurationResult.error.issues[0]
          ? configurationResult.error.issues[0].message
          : configurationResult.error.message,
      );
    }

    if (typeof key === "undefined") {
      const configurationToml = stringify(configurationResult.data);

      console.log(configurationToml);

      return;
    }

    const value = getConfigurationValue(configurationResult.data, key);

    if (typeof value === "object" && value !== null) {
      console.log(stringify(createConfigurationObject(key, value)));
      return;
    }

    console.log(value);
  });

configureCLI
  .command("set")
  .description("Update Lanboot configuration value.")
  .argument("<key>", "Lanboot configuration key.")
  .argument("<value>", "Configuration value.")
  .action(async (key: string, value: string) => {
    const foundConfiguration = await getConfiguration();

    if (!foundConfiguration) {
      throw new ConfigurationError(
        "Lanboot configuration doesn't exists, create one by running lanboot config create.",
      );
    }

    const configurationResult =
      LanbootConfigurationSchema.safeParse(foundConfiguration);

    if (!configurationResult.success) {
      throw new ConfigurationError(
        configurationResult.error.issues[0]
          ? configurationResult.error.issues[0].message
          : configurationResult.error.message,
      );
    }

    const configuration = structuredClone(configurationResult.data);

    const currentValue = getConfigurationValue(configuration, key);
    const parsedValue = parseConfigurationValue(currentValue, value);

    setConfigurationValue(configuration, key, parsedValue);

    const validationResult =
      LanbootConfigurationSchema.safeParse(configuration);

    if (!validationResult.success) {
      throw new ConfigurationError(
        validationResult.error.issues[0]
          ? validationResult.error.issues[0].message
          : validationResult.error.message,
      );
    }

    try {
      await setConfiguration(validationResult.data);

      console.log("Lanboot configuration update succeeded.");
    } catch (error) {
      if (error instanceof Error) {
        throw new ConfigurationError(error.message);
      }

      throw new ConfigurationError(
        "Unexpected error occured upon updating the configuration.",
      );
    }
  });

export { configureCLI };

import fsPromises from "node:fs/promises";
import { LanbootConfiguration } from "@/schemas/lanboot";
import ini from "ini";
import { SMB_CONFIGURATION_FILE } from "@/constants/smb";
import { getId } from "@/services/internal";

function toIni(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

async function configureSMB(configuration: LanbootConfiguration) {
  const { shares, ...global } = configuration.smb;

  const smbConfigurations = {
    global: Object.fromEntries(
      Object.entries(global).map(([key, value]) => [toIni(key), value]),
    ),
    ...Object.fromEntries(
      shares.map((share) => {
        const { name, ...others } = share;

        return [
          name,
          Object.fromEntries(
            Object.entries(others).map(([key, value]) => [toIni(key), value]),
          ),
        ];
      }),
    ),
  };

  const nobodyUserId = await getId({
    user: "nobody",
    options: { userId: true },
  });

  const nobodyGroupId = await getId({
    user: "nobody",
    options: { groupId: true },
  });

  for await (const share of shares) {
    await fsPromises.mkdir(share.path, { recursive: true });
    await fsPromises.chown(
      share.path,
      parseInt(nobodyUserId.stdout.trim(), 10),
      parseInt(nobodyGroupId.stdout.trim(), 10),
    );
  }

  const paths = SMB_CONFIGURATION_FILE.split("/");

  paths.pop();

  await fsPromises.mkdir(paths.join("/"), { recursive: true });

  await fsPromises.writeFile(
    SMB_CONFIGURATION_FILE,
    ini.stringify(smbConfigurations),
  );
}

export { configureSMB };

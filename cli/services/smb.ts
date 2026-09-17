import fsPromises from "node:fs/promises";
import { LanbootConfiguration } from "@/schemas/lanboot";
import ini from "ini";
import { SMB_CONFIGURATION_FILE } from "@/constants/smb";
import { $ } from "zx";

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

  const nobodyIdResult = await $`id -u nobody`;
  const nogroupIdResult = await $`id -g nobody`;

  for await (const share of shares) {
    await fsPromises.mkdir(share.path, { recursive: true });
    await fsPromises.chown(
      share.path,
      parseInt(nobodyIdResult.stdout.trim(), 10),
      parseInt(nogroupIdResult.stdout.trim(), 10),
    );
  }

  await fsPromises.writeFile(
    SMB_CONFIGURATION_FILE,
    ini.stringify(smbConfigurations),
  );
}

export { configureSMB };

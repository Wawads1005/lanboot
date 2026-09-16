import fsPromises from "node:fs/promises";
import { LanbootConfiguration } from "@/schemas/lanboot";
import { TFTP_CONFIGURATION_FILEPATH } from "@/constants/tftp";

async function configureTFTP(configuration: LanbootConfiguration) {
  const { tftp } = configuration;

  const tftpConfiguration = [`tftp-root=${tftp.root}`];

  if (tftp.enable) {
    tftpConfiguration.push("enable-tftp");
  }

  await fsPromises.writeFile(
    TFTP_CONFIGURATION_FILEPATH,
    `${tftpConfiguration.join("\n")}\n`,
  );
}

export { configureTFTP };

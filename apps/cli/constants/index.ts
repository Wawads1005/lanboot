const CONFIG_FILEPATH = "/etc/lanboot.conf";
const SERVER_DIRECTORY = "/opt/lanboot/server";
const SERVER_FILEPATH = `${SERVER_DIRECTORY}/build/index.js`;
const SERVICE_NAME = "lanboot";
const SERVICE_FILEPATH = `/etc/systemd/system/${SERVICE_NAME}.service`;

export {
  CONFIG_FILEPATH,
  SERVER_DIRECTORY,
  SERVER_FILEPATH,
  SERVICE_NAME,
  SERVICE_FILEPATH,
};

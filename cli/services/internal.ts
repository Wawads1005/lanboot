import { $ } from "zx";

$.shell = "/usr/bin/bash";
$.nothrow = true;

async function installServices() {
  const response = await $`apt-get install dnsmasq nginx samba -y`;

  return response;
}

async function startServices() {
  const response =
    await $`systemctl start dnsmasq.service nginx.service smbd.service`;

  return response;
}

export { installServices, startServices };

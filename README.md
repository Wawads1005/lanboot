# Lanboot

**Open-source diskless boot infrastructure for Windows clients.**

Lanboot is a Linux-based diskless boot server designed to help you deploy and boot Windows clients over a local network. It aims to provide an open-source alternative to commercial diskless solutions commonly used in internet cafés and shared-computer environments.

Lanboot combines network booting, centralized storage, and Windows deployment into a single project. It uses PXE/iPXE to boot clients, WinPE to prepare Windows installations, and iSCSI to provide remote storage to diskless machines.

**Status: Prototype.** Lanboot is under active development and is not yet recommended for production deployments without thorough testing.

## Features

- **PXE/iPXE booting** — Boot clients over the local network using a custom iPXE script.
- **Windows PE deployment** — Boot into WinPE to install and prepare Windows.
- **Centralized storage** — Manage storage resources using Linux storage tools.
- **iSCSI boot infrastructure** — Provide remote block storage to Windows clients.
- **Service configuration** — Configure the required system services through the Lanboot CLI.
- **Automated setup** — Build and deploy the server and configure its dependencies.

Features and compatibility are evolving. Some workflows still require manual configuration.

## Architecture

Lanboot orchestrates existing Linux services and boot technologies rather than implementing every component itself.

| Component         | Purpose                                               |
| ----------------- | ----------------------------------------------------- |
| dnsmasq           | DHCP/PXE boot configuration and TFTP services         |
| iPXE              | Network bootloader and boot script execution          |
| Node.js API       | Serves boot scripts and static boot assets            |
| WinPE and wimboot | Loads the Windows preinstallation environment         |
| Samba (SMB)       | Provides network access to Windows installation media |
| LVM               | Manages storage volumes                               |
| Linux LIO/iSCSI   | Exposes storage to diskless clients                   |
| systemd           | Manages Lanboot and its configured services           |

The intended workflow is:

1. A client obtains network configuration and discovers its network boot program.
2. The client loads the Lanboot iPXE binary through TFTP.
3. iPXE requests the boot script from the Lanboot API over HTTP.
4. The user selects a boot option, such as WinPE.
5. WinPE loads and can access Windows installation media over the network.
6. Once the Windows master image and client storage are prepared, the client can boot Windows from its configured iSCSI target.

## Requirements

### Server

- Ubuntu Linux server.
- Git, Node.js, and pnpm.
- A network interface connected to the client network.
- One or more storage devices dedicated to Lanboot.
- Administrative privileges for installing dependencies, configuring services, and managing storage.

### Windows technician machine

- A Windows machine for preparing WinPE.
- Windows Assessment and Deployment Kit (ADK).
- The matching Windows PE add-on.
- Network access to the Lanboot server.

See Microsoft's [Windows ADK installation guide](https://learn.microsoft.com/en-us/windows-hardware/get-started/adk-install) for the current installation requirements.

### Client

- A network adapter capable of PXE booting.
- Legacy BIOS support for the BIOS boot flow documented below.
- Compatible network and storage drivers for the intended Windows installation.

The current Quick Start documents the Legacy BIOS workflow. UEFI is not enabled in the current CLI configuration wizard.

## Quick Start

This guide covers building Lanboot, configuring the server, preparing iPXE and WinPE, and booting a client into WinPE.

### 1. Clone and build Lanboot

```bash
git clone https://github.com/wawads1005/lanboot.git
cd lanboot

pnpm install
pnpm run build
```

### 2. Install Lanboot and its dependencies

```bash
pnpm -F @lanboot/cli lanboot install
```

The installer installs system dependencies, configures the required kernel modules, builds and deploys the server, and generates the systemd service.

**Warning:** The installer removes and recreates the deployed server directory at `/opt/lanboot/server`. Run it before copying your WinPE files into that directory. If you reinstall later, back up your assets and restore them afterward.

### 3. Configure Lanboot

```bash
pnpm -F @lanboot/cli lanboot configure
```

The configuration wizard asks for the network interface, API settings, storage devices, storage sizes, boot firmware, boot filename, and TFTP root.

Example configuration:

```text
✔ Select a Network Interface: enp3s0
✔ Enter your API Port: 8080
✔ Enter your API Static Path: public
✔ Check every blockdevices lanboot is allowed to use: OSC SSD 256GB
✔ Enter your Storage Pool: lanboot
✔ Enter your Storage Master: master
✔ Enter your Storage Master Size: 64G
✔ Enter your Storage Overlay Size: 24G
✔ Select a firmware: bios
✔ Enter your Boot Filename: lanboot.kpxe
✔ Enter your TFTP root: /srv/tftp
```

Choose values appropriate for your server.

- Select the interface clients will use to reach Lanboot.
- Select only storage devices you intend Lanboot to manage.
- Ensure sufficient storage capacity for the master image and overlays.
- Choose the firmware mode supported by your clients.

Review the selected storage devices carefully. Storage operations can affect existing data.

The configuration wizard also configures the required dependencies. Review the generated configuration and confirm that it matches your network.

### 4. Generate the iPXE script

```bash
pnpm -F @lanboot/cli lanboot generate ipxe
```

This generates `lanboot.ipxe` in the CLI package directory:

```text
apps/cli/lanboot.ipxe
```

The generated script sets the `next-server` address and loads the boot script from the Lanboot API.

Review the generated file before building the bootloader.

### 5. Build the iPXE bootloader

Clone the official iPXE repository from the Lanboot repository root:

```bash
git clone https://github.com/ipxe/ipxe.git
cd ipxe/src
```

Build a BIOS network boot program with the generated Lanboot script embedded:

```bash
make bin/undionly.kpxe EMBED=../../apps/cli/lanboot.ipxe
```

The relative path above assumes that you cloned iPXE into the Lanboot repository root and generated the script using the command in Step 4.

Embedding the script makes the iPXE binary automatically execute the configured Lanboot boot flow.

For details, see the [official iPXE embedded scripts documentation](https://ipxe.org/embed).

Copy the binary into the configured TFTP root. With the example settings `BOOT_FILENAME=lanboot.kpxe` and `TFTP_ROOT=/srv/tftp`:

```bash
sudo install -D bin/undionly.kpxe /srv/tftp/lanboot.kpxe
```

Run this command from `ipxe/src`. If you changed the configured filename or TFTP root, adjust the destination accordingly.

### 6. Prepare WinPE boot files

WinPE provides the environment used to install and prepare Windows.

On your Windows technician machine, install the Windows ADK and the matching WinPE add-on. Follow the [official iPXE Windows PE guide](https://ipxe.org/howto/winpe) to prepare the boot image.

The required files are:

- `BCD`
- `boot.sdi`
- `boot.wim`
- `wimboot`

With `API_STATIC_PATH=public`, the expected deployed directory structure is:

```text
/opt/lanboot/server/public/
└── windows/
    └── winpe/
        ├── boot/
        │   ├── BCD
        │   └── boot.sdi
        ├── sources/
        │   └── boot.wim
        └── wimboot
```

Create the directories on the server:

```bash
sudo mkdir -p /opt/lanboot/server/public/windows/winpe/boot
sudo mkdir -p /opt/lanboot/server/public/windows/winpe/sources
```

From PowerShell on the technician machine, copy the files to the server. Replace the example username and IP address as necessary:

```powershell
scp C:\WinPE\amd64\media\boot\BCD wawads@192.168.100.243:/opt/lanboot/server/public/windows/winpe/boot/

scp C:\WinPE\amd64\media\boot\boot.sdi wawads@192.168.100.243:/opt/lanboot/server/public/windows/winpe/boot/

scp C:\WinPE\amd64\media\sources\boot.wim wawads@192.168.100.243:/opt/lanboot/server/public/windows/winpe/sources/
```

Download `wimboot` from the [official iPXE wimboot page](https://ipxe.org/wimboot) and copy it into the WinPE directory:

```bash
sudo cp ~/Downloads/wimboot /opt/lanboot/server/public/windows/winpe/wimboot
```

Ensure the Lanboot service can read all four files.

The `public` path is resolved relative to the deployed server directory because the generated systemd service sets its working directory to `/opt/lanboot/server`. You can also configure an absolute static path.

**Important:** The on-disk directory structure must match the URLs requested by the generated iPXE script. Verify those URLs if your configuration or directory layout differs from this example.

### 7. Start Lanboot

```bash
pnpm -F @lanboot/cli lanboot start
```

This loads the configuration, starts the configured dependencies and Lanboot service, and enables the services to start automatically at boot.

Check that the services are running and that the required files are accessible.

For example, create a temporary file named `test.txt` in the static directory and test it from the server:

```bash
curl http://192.168.100.243:8080/test.txt
```

The expected response is the contents of `test.txt`. Remove the temporary file after testing.

### 8. Verify network boot services

Lanboot uses dnsmasq for its PXE/TFTP boot configuration and serves the next-stage boot script through its HTTP API.

Before booting a client, verify:

- The server has the expected IP address on the client network.
- The DHCP/PXE configuration points clients to the appropriate boot program.
- TFTP serves the configured boot filename from the configured root.
- The HTTP API is reachable from the client network.
- The WinPE files are available through the API's static server.

If your network already has a DHCP server, ensure the PXE setup is compatible with it. Avoid running a competing DHCP server. Use the proxy-DHCP arrangement configured for your environment where appropriate.

### 9. Configure client firmware

On the client machine:

1. Enter BIOS/firmware setup.
2. Enable PXE Boot or the Network Stack.
3. Enable Legacy Boot for the BIOS `undionly.kpxe` binary.
4. Disable Secure Boot when using an unsigned iPXE binary.
5. Select network boot from the boot menu.

The BIOS binary built in Step 5 is not a UEFI bootloader. Use a bootloader that matches the client's firmware mode.

### 10. Boot into WinPE

Boot the client from the network.

1. Wait for the Lanboot menu to appear.
2. Press F12 if prompted to open the menu.
3. Select **Install an Operating System**.
4. Select **Install Windows**.
5. Select **Install Windows 10**.

Menu labels depend on the current boot script. The client should load the WinPE image prepared in Step 6.

### 11. Install Windows

Booting WinPE does not itself install Windows. You must provide Windows installation media separately.

One option is to share the installation files from the server over SMB.

1. Copy the Windows installation media to a directory on the server.
2. Share the directory using Samba/SMB.
3. Ensure WinPE can reach the server and access the share.
4. Connect to the share from WinPE and run Windows Setup.

For example, if the share is `\\192.168.100.243\installation`, connect to it from WinPE and launch `setup.exe` from the installation media.

This example assumes the share already exists and its permissions allow the client to read the files.

Choose the appropriate installation target for your intended workflow. Installing Windows onto a local disk and installing it onto an iSCSI target are different procedures.

### 12. Boot diskless clients

After Windows has been installed and the master image prepared, configure the clients to boot from Lanboot storage.

Verify that:

- The master image is bootable.
- The iSCSI target and LUN are configured correctly.
- The client initiator is authorized to access its target.
- Windows has the required network and storage drivers.
- The client overlay is configured correctly.
- The client's firmware and network adapter are compatible with the boot configuration.

Start with one test client before deploying to additional machines.

Successful PXE boot and WinPE loading do not guarantee that Windows will boot successfully from iSCSI. Validate the complete workflow before relying on it.

## CLI Reference

The current CLI provides these commands:

| Command                 | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `lanboot install`       | Install dependencies and deploy the server           |
| `lanboot configure`     | Configure Lanboot and its dependencies               |
| `lanboot start`         | Start and enable Lanboot and its configured services |
| `lanboot stop`          | Stop and disable Lanboot and its configured services |
| `lanboot generate ipxe` | Generate the embedded iPXE script                    |

When running through the pnpm workspace, use the corresponding command prefix:

```bash
pnpm -F @lanboot/cli lanboot <command>
```

## Troubleshooting

### PXE client does not receive network configuration

Check the network connection, client VLAN, DHCP service, and PXE configuration. If another DHCP server is active, verify that it is compatible with the configured proxy-DHCP setup.

### Client cannot download the bootloader

Verify the DHCP/PXE boot filename, the TFTP root, and the presence and permissions of the configured NBP.

### iPXE starts but cannot load the Lanboot menu

Check the embedded `lanboot.ipxe` script, the configured server address and API port, and HTTP connectivity from the client network.

### WinPE does not boot

Verify that `BCD`, `boot.sdi`, `boot.wim`, and `wimboot` exist in the expected directories. Check that the generated iPXE script requests the correct URLs and that the BCD paths agree with the files supplied to `wimboot`.

See the [iPXE wimboot architecture notes](https://ipxe.org/appnote/wimboot_architecture) for further diagnostics.

### Windows BSOD: Paging File Configuration

If Windows crashes with a BSOD during diskless boot and the paging-file configuration is suspected, try adjusting the master image from WinPE.

1. Load the Windows master image from WinPE.
2. Load the master image's offline Windows registry.
3. Set the paging-file configuration to an empty string.
4. Unload the offline registry to save the changes.
5. Boot the client again.

The exact registry key and value should be verified for the Windows installation being used.

Alternatively, you can configure a RAM disk backed by an iSCSI target on your server to host the paging file. This requires additional manual configuration and is outside the scope of this guide.

### Windows fails to boot from iSCSI

Check the target, LUN, initiator ACL, boot-critical storage drivers, and network adapter compatibility. A configuration that works on one motherboard may not work on another.

Start by confirming that the client can reach its iSCSI target and that Windows has the drivers required to access the boot device.

## Limitations

Lanboot is a prototype, and its capabilities and compatibility are still evolving.

- The documented Quick Start focuses on Legacy BIOS boot.
- UEFI configuration is not currently enabled in the CLI wizard.
- Windows installation and master-image preparation may require manual steps.
- Motherboard, network adapter, and Windows driver compatibility can vary.
- Some storage and client workflows require manual configuration.
- Production hardening, recovery procedures, and broader hardware testing remain important before deployment in a critical environment.

## Contributing

Contributions, testing, bug reports, and documentation improvements are welcome.

When reporting a boot issue, include the motherboard model, firmware mode, network adapter, Windows version, error code, and the steps needed to reproduce the problem. Avoid including passwords, private keys, or other sensitive configuration data.

## License

See the repository's `LICENSE` file for licensing terms.

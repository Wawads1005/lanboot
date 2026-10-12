# Lanboot

**Open-source diskless boot infrastructure for Windows clients.**

Lanboot is a Linux-based diskless boot server designed to boot Windows clients over a local network. It aims to provide an open-source alternative to commercial diskless solutions commonly used in internet cafés and shared-computer environments.

Lanboot combines PXE/iPXE network booting, centralized storage, Windows deployment, and iSCSI boot infrastructure.

**Status: Prototype.** Lanboot is under active development and is not yet recommended for production deployments without thorough testing.

## Features

- **PXE/iPXE booting** — Boot clients over the local network.
- **Dynamic boot entries** — Generate the boot menu from discovered boot entries instead of relying on a hardcoded operating-system menu.
- **Windows PE deployment** — Load WinPE to install and prepare Windows.
- **Centralized storage** — Manage master images and client overlays using LVM.
- **iSCSI boot infrastructure** — Export master images and client-specific overlays to diskless clients.
- **Service configuration** — Configure required system services through the Lanboot CLI.
- **Automated setup** — Install dependencies, deploy the server, and configure its services.

Some workflows still require manual configuration. Boot-entry creation and asset management are not yet exposed through dedicated API endpoints.

## Architecture

Lanboot orchestrates existing Linux services and boot technologies rather than implementing every component itself.

| Component         | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| dnsmasq           | DHCP/PXE boot configuration and TFTP services        |
| iPXE              | Network bootloader and boot script execution         |
| Node.js API       | Generates boot scripts and serves static boot assets |
| WinPE and wimboot | Load the Windows preinstallation environment         |
| Samba (SMB)       | Provide network access to Windows installation media |
| LVM               | Manage master volumes and client overlays            |
| Linux LIO/iSCSI   | Export remote block storage to clients               |
| systemd           | Manage Lanboot and its configured services           |

### Boot workflow

1. The client obtains network configuration and discovers its network boot program.
2. The client downloads the iPXE binary through TFTP.
3. iPXE requests the boot script from the Lanboot API over HTTP.
4. Lanboot generates a menu from the available boot entries and iSCSI options.
5. When a boot entry is selected, iPXE hooks the configured master iSCSI disk and loads the entry's kernel and image files.
6. For Windows installation, WinPE accesses the Windows installation media separately, such as through SMB or USB.
7. After Windows has been installed and the master image is bootable, clients can boot from their respective iSCSI overlays.

The master image is the base for client overlays. A client overlay is recreated from the master when requested, provided an existing target has no active iSCSI sessions. **Recreating an overlay discards changes stored in that overlay.**

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

The current Quick Start documents the Legacy BIOS workflow. UEFI configuration is not enabled in the current CLI configuration wizard.

## Quick Start

This guide covers building Lanboot, configuring the server, preparing iPXE and WinPE, and booting a client.

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

The installer installs system dependencies, configures required kernel modules, builds and deploys the server, and generates the systemd service.

**Warning:** The installer removes and recreates the deployed server directory at `/opt/lanboot/server`. Run it before copying boot assets into that directory. Back up and restore your assets if you reinstall later.

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
- Ensure the storage pool has sufficient capacity for the master image and client overlays.
- Choose the firmware mode supported by your clients.

Review the selected storage devices carefully. Storage operations can affect existing data.

### 4. Generate the iPXE script

```bash
pnpm -F @lanboot/cli lanboot generate ipxe
```

This generates the embedded iPXE script:

```text
apps/cli/lanboot.ipxe
```

The script sets up the initial network boot flow and requests the dynamically generated boot menu from the Lanboot API.

Review the generated file before building the bootloader.

### 5. Build the iPXE bootloader

Clone the official iPXE repository from the Lanboot repository root:

```bash
git clone https://github.com/ipxe/ipxe.git
cd ipxe/src
```

#### Enable request parameter commands

Lanboot uses the iPXE `params` and `param` commands to send the client's MAC address to the overlay endpoint using an HTTP POST request. These commands require the `PARAM_CMD` build option.

Edit `config/general.h` and enable `PARAM_CMD` alongside the other command definitions:

```c
#define PARAM_CMD /* Request parameter commands */
```

If `PARAM_CMD` is already enabled, no change is necessary.

#### Build the BIOS bootloader

Build the BIOS network boot program with the generated Lanboot script embedded:

```bash
make bin/undionly.kpxe EMBED=../../apps/cli/lanboot.ipxe
```

The relative path assumes that you cloned iPXE into the Lanboot repository root and generated the script in Step 4.

Embedding the script makes iPXE execute the configured Lanboot boot flow automatically.

For details, see the [official iPXE embedded scripts documentation](https://ipxe.org/embed) and the [PARAM_CMD build option](https://ipxe.org/buildcfg/param_cmd).

Copy the binary into the configured TFTP root. With the example settings `BOOT_FILENAME=lanboot.kpxe` and `TFTP_ROOT=/srv/tftp`:

```bash
sudo install -D bin/undionly.kpxe /srv/tftp/lanboot.kpxe
```

Run this command from `ipxe/src`. If you changed the configured filename or TFTP root, adjust the destination accordingly.

### 6. Prepare WinPE

WinPE provides the environment used to install and prepare Windows.

On your Windows technician machine, install the Windows ADK and the matching WinPE add-on. Follow the [official iPXE Windows PE guide](https://ipxe.org/howto/winpe) to prepare the boot image.

The required files are:

- `wimboot`
- `BCD`
- `boot.sdi`
- `boot.wim`

The current Windows boot-entry example uses the ID `winpe`. With `API_STATIC_PATH=public`, place the files under the corresponding entry directory:

```text
/opt/lanboot/server/public/
└── winpe/
    ├── wimboot
    ├── bcd
    ├── boot.sdi
    └── boot.wim
```

The paths and filenames above match the current example boot entry. If your boot-entry definition uses different paths, the on-disk files must match it.

Create the directory:

```bash
sudo mkdir -p /opt/lanboot/server/public/winpe
```

From PowerShell on the technician machine, copy the files to the server. Replace the example username, IP address, and source paths as necessary:

```powershell
scp C:\WinPE\amd64\media\boot\BCD wawads@192.168.100.243:/opt/lanboot/server/public/winpe/bcd

scp C:\WinPE\amd64\media\boot\boot.sdi wawads@192.168.100.243:/opt/lanboot/server/public/winpe/boot.sdi

scp C:\WinPE\amd64\media\sources\boot.wim wawads@192.168.100.243:/opt/lanboot/server/public/winpe/boot.wim
```

Download `wimboot` from the [official iPXE wimboot page](https://ipxe.org/wimboot) and copy it into the entry directory:

```bash
sudo cp ~/Downloads/wimboot /opt/lanboot/server/public/winpe/wimboot
```

Ensure the Lanboot service can read all four files.

The static path is resolved relative to the deployed server directory because the generated systemd service uses `/opt/lanboot/server` as its working directory. An absolute static path can also be configured.

### 7. Configure a boot entry

Lanboot discovers boot entries and uses them to generate the boot menu. Each entry has a stable ID, a display name, a kernel definition, and a list of images to load.

A Windows PE entry conceptually contains:

```json
{
  "id": "winpe",
  "name": "Windows Preinstallation Environment",
  "kernel": {
    "name": "wimboot",
    "path": "wimboot",
    "args": ["index=1", "gui"]
  },
  "images": [
    {
      "name": "BCD",
      "path": "bcd",
      "args": ["BCD"]
    },
    {
      "name": "boot.sdi",
      "path": "boot.sdi",
      "args": ["boot.sdi"]
    },
    {
      "name": "boot.wim",
      "path": "boot.wim",
      "args": ["boot.wim"]
    }
  ],
  "version": 1
}
```

This illustrates the entry's data model; use the metadata format and discovery mechanism implemented by the current `getBootEntries` function.

- `id` identifies the entry and its static asset directory.
- `name` is displayed in the boot menu.
- `kernel.name` is the name passed to iPXE's image-loading command.
- `kernel.path` identifies the actual file to download.
- `images` lists the additional files required by the boot program.
- `args` supplies the arguments or filenames passed to iPXE.
- `version` identifies the boot-entry schema version.

The boot-entry creation and upload workflow is currently manual. A dedicated CLI command or API endpoint for creating entries and uploading their assets has not yet been implemented.

### 8. Start Lanboot

```bash
pnpm -F @lanboot/cli lanboot start
```

This starts Lanboot and its configured services.

Verify that the services are running and the API can serve static files. Create a temporary test file:

```bash
echo "Hello, World!" | sudo tee /opt/lanboot/server/public/greetings.txt > /dev/null
```

Request the file through the API's static file server:

```bash
curl http://192.168.100.243:8080/greetings.txt
```

The expected response is:

```text
Hello, World!
```

Remove the temporary file after testing:

```bash
sudo rm /opt/lanboot/server/public/greetings.txt
```

### 9. Verify network boot services

Before booting a client, verify:

- The server has the expected IP address on the client network.
- The DHCP/PXE configuration points clients to the appropriate boot program.
- TFTP serves the configured boot filename from the configured root.
- The HTTP API is reachable from the client network.
- The boot-entry assets are accessible through the API's static file server.

If your network already has a DHCP server, ensure the PXE setup is compatible with it. Avoid running a competing DHCP server. Use the proxy-DHCP arrangement configured for your environment where appropriate.

### 10. Configure client firmware

On the client machine:

1. Enter BIOS/firmware setup.
2. Enable PXE Boot or the Network Stack.
3. Enable Legacy Boot for the BIOS `undionly.kpxe` binary.
4. Disable Secure Boot when using an unsigned iPXE binary.
5. Select network boot from the boot menu.

The BIOS binary built in Step 5 is not a UEFI bootloader. Use a bootloader that matches the client's firmware mode.

### 11. Boot WinPE

Boot the client from the network.

1. Wait for the Lanboot menu to appear.
2. Press F12 if prompted to open the menu.
3. Select **Boot**.
4. Select **Entry**.
5. Select **Windows Preinstallation Environment**.

The entry hooks the configured master iSCSI disk as a SAN device, loads `wimboot` and its required images, and executes the boot program.

Menu options are generated from discovered boot entries, so the available entry names depend on the server's current configuration.

### 12. Install Windows onto the master image

Booting WinPE does not itself install Windows. You must provide Windows installation media separately.

One option is to share the installation files from the server over SMB.

1. Copy the Windows installation media to a directory on the server.
2. Share the directory using Samba/SMB.
3. Ensure WinPE can reach the server and access the share.
4. Connect to the share from WinPE and run Windows Setup.
5. Select the master iSCSI disk as the installation target.

For example, if the share is `\\192.168.100.243\installation`, connect to it from WinPE and launch `setup.exe` from the installation media.

This assumes the share already exists and its permissions allow the client to read the files.

**Important:** Confirm that Windows Setup is installing to the intended master disk. Changes made to the master affect the base image used by subsequently created overlays.

### 13. Verify the master before booting overlays

Before using client overlays:

- Confirm the master image contains a working Windows installation.
- Verify that the master iSCSI target is accessible and bootable.
- Confirm that Windows has the necessary network and storage drivers.
- Test the master boot workflow on compatible hardware.
- Only then test a client-specific overlay.

### 14. Boot diskless clients

Select **Boot → iSCSI → Overlay** from the Lanboot menu.

The client submits its MAC address to `POST /api/boot`. Lanboot creates a writable LVM overlay based on the configured master image, creates the corresponding LIO block backstore and iSCSI target, configures the TPG and LUN, enables the portal, and returns an iPXE script to boot from the overlay.

**Warning:** The current overlay workflow recreates an existing overlay when no active iSCSI sessions are present. This resets the overlay to the master image and discards changes stored in the previous overlay. Do not use it for persistent client data without implementing a persistence strategy.

Start with one test client before deploying to additional machines.

Successful PXE boot and WinPE loading do not guarantee that Windows will boot successfully from iSCSI. Validate the complete workflow before relying on it.

## API Reference

Lanboot exposes an HTTP endpoint for generating the iPXE boot menu and preparing client-specific iSCSI overlays. It also serves static files from the configured static directory.

### Base URL

The API uses the port configured by `API_PORT`.

```text
http://<server-ip>:<api-port>
```

Replace `<server-ip>` with the Lanboot server's IP address and `<api-port>` with the configured API port.

### Endpoints

| Method | Endpoint    | Description                                                                           |
| ------ | ----------- | ------------------------------------------------------------------------------------- |
| `GET`  | `/api/boot` | Discovers boot entries and generates the iPXE boot menu and scripts.                  |
| `POST` | `/api/boot` | Creates or recreates a client-specific overlay and returns an iPXE script to boot it. |

### `GET /api/boot`

Generates an iPXE script containing the current Lanboot menu and boot-entry labels.

The menu includes:

- **Boot** — Opens the boot submenu.
- **Entry** — Lists the discovered boot entries.
- **iSCSI** — Offers the master and overlay boot options.
- **iPXE Shell** — Opens the iPXE shell.
- **Poweroff** — Powers off the client.

The menu also uses a timed prompt to open the menu when F12 is pressed, with the default timeout path proceeding to the overlay boot flow.

#### Boot-entry execution

For each discovered boot entry, Lanboot generates a label that:

1. Sets the configured next-server address and preserves the SAN connection setting.
2. Hooks the configured master iSCSI target as drive `0x80`.
3. Loads the entry's kernel or boot program from its configured path.
4. Fetches the entry's additional images.
5. Executes the boot program.

For the Windows PE example, `wimboot` loads the BCD, boot sector disk image, and Windows PE image.

#### Response

**Success:** `200 OK`

Content type: `text/plain`

The response body contains the generated iPXE script.

### `POST /api/boot`

Creates a client-specific writable overlay based on the configured master image, configures an iSCSI target for that overlay, and returns an iPXE script to boot the client.

#### Request body

The request must contain a JSON object with a `macAddress` field.

```json
{
  "macAddress": "a1b2c3d4e5f6"
}
```

The value must satisfy the validation rules defined by `createOverlayInput` in `@lanboot/validators`. Refer to that schema for the exact accepted format.

#### Processing

The handler performs the following operations:

1. Validates the request body.
2. Checks whether an iSCSI target already exists for the specified MAC address.
3. Rejects the request if the existing target has active sessions.
4. Deletes the existing target, block backstore, and logical volume when present and eligible for removal.
5. Creates a writable LVM overlay based on the configured master image.
6. Creates the LIO block backstore and iSCSI target.
7. Creates TPG 1 in a disabled state.
8. Creates LUN 0 and links it to the new block backstore.
9. Configures the TPG attributes and creates the portal.
10. Enables the TPG.
11. Generates an iPXE script that hooks the overlay as a SAN device and boots from it.

**Important:** This endpoint can delete and recreate existing overlay storage. Do not issue requests for clients with data that must be preserved. An existing target with active iSCSI sessions cannot be recreated.

#### Response

**Success:** `200 OK`

Content type: `text/plain`

The response body contains an iPXE script that connects to the newly configured iSCSI target and boots from it.

### Error responses

Errors are returned as plain-text iPXE scripts that display a Lanboot error message.

| Status                      | Condition                                                 |
| --------------------------- | --------------------------------------------------------- |
| `500 Internal Server Error` | A validation or processing error occurs.                  |
| `404 Not Found`             | An unsupported HTTP method is used for the boot endpoint. |

The current handler returns `500` for caught validation errors and other exceptions. Error responses contain an iPXE `echo` command with the error name and message.

### Example request

Request a client-specific overlay using `curl`:

```bash
curl -X POST \
  http://192.168.100.243:8080/api/boot \
  -H "Content-Type: application/json" \
  -d '{ "macAddress": "a1b2c3d4e5f6" }'
```

The response should contain an iPXE script if the overlay is created successfully. This operation modifies server storage and should be tested with a disposable client overlay.

### Static file serving

The API serves files from the directory configured by `API_STATIC_PATH`.

For example, with `API_PORT=8080`, `API_STATIC_PATH=public`, and a boot entry whose ID is `winpe`, the file at:

```text
public/winpe/wimboot
```

is available at:

```text
http://192.168.100.243:8080/winpe/wimboot
```

The URL depends on the configured static directory, entry ID, and relative asset path.

## CLI Reference

The current CLI provides these commands:

| Command                 | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `lanboot install`       | Install dependencies and deploy the server.           |
| `lanboot configure`     | Configure Lanboot and its dependencies.               |
| `lanboot start`         | Start and enable Lanboot and its configured services. |
| `lanboot stop`          | Stop and disable Lanboot and its configured services. |
| `lanboot generate ipxe` | Generate the embedded iPXE script.                    |

When running through the pnpm workspace, use the corresponding command prefix:

```bash
pnpm -F @lanboot/cli lanboot <command>
```

## Troubleshooting

### PXE client does not receive network configuration

Check the network connection, client VLAN, DHCP service, and PXE configuration. If another DHCP server is active, verify that it is compatible with the configured proxy-DHCP setup.

### Client cannot download the bootloader

Verify the DHCP/PXE boot filename, TFTP root, and presence and permissions of the configured network boot program.

### iPXE starts but cannot load the Lanboot menu

Check the embedded `lanboot.ipxe` script, the configured server address and API port, and HTTP connectivity from the client network.

### A boot entry does not appear

Check that the entry is discoverable by the current `getBootEntries` implementation and that its metadata passes validation. Verify that the entry ID and display name are valid.

### A boot entry fails to load

Check that its kernel and image paths match the actual files under the configured static directory. Confirm that the generated iPXE script requests the expected URLs and passes the correct image names and arguments to the boot program.

### WinPE does not boot

Verify that `wimboot`, `BCD`, `boot.sdi`, and `boot.wim` exist in the expected locations. Check that the BCD configuration agrees with the files supplied to `wimboot`.

See the [iPXE wimboot architecture notes](https://ipxe.org/appnote/wimboot_architecture) for further diagnostics.

### An overlay cannot be created

Check the configured storage pool, master logical volume, available capacity, and LIO configuration. If the target already exists, verify that no active iSCSI sessions are using it.

Remember that recreating an overlay resets it to the master image and removes the previous overlay's changes.

### Windows fails to boot from iSCSI

Check the target, LUN mapping, initiator access, boot-critical storage drivers, and network adapter compatibility. A configuration that works on one motherboard may not work on another.

Confirm that the client can reach its iSCSI target and that Windows has the drivers required to access the boot device.

## Limitations

Lanboot is a prototype, and its capabilities and compatibility are still evolving.

- The documented Quick Start focuses on Legacy BIOS boot.
- UEFI configuration is not currently enabled in the CLI wizard.
- Boot-entry creation and asset uploads still require manual configuration.
- Windows installation and master-image preparation may require manual steps.
- Motherboard, network adapter, and Windows driver compatibility can vary.
- The current overlay workflow recreates eligible overlays instead of preserving their changes.
- Production hardening, recovery procedures, persistence strategies, and broader hardware testing remain important before deployment in a critical environment.

## Contributing

Contributions, testing, bug reports, and documentation improvements are welcome.

When reporting a boot issue, include the motherboard model, firmware mode, network adapter, Windows version, error code, and the steps needed to reproduce the problem. Avoid including passwords, private keys, or other sensitive configuration data.

## License

See the repository's `LICENSE` file for licensing terms.

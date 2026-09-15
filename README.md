# Lanboot

An open-source diskless boot infrastructure for Windows clients, inspired by commercial solutions such as CCBoot and SENETBoot.

Lanboot uses standard Linux services and protocols:

- DHCP/PXE — `dnsmasq`
- TFTP — `dnsmasq`
- HTTP — `nginx`
- SMB — `Samba`
- Storage — LVM
- Disk access — iSCSI
- PXE bootloader — iPXE
- Windows deployment — Windows PE

## How It Works

```text
                    ┌─────────────────────┐
                    │    Linux Server     │
                    │                     │
                    │ dnsmasq   DHCP/PXE  │
                    │ TFTP      iPXE      │
                    │ nginx     WinPE     │
                    │ Samba     Installer │
                    │ LVM       Storage   │
                    │ iSCSI     Disk      │
                    └──────────┬──────────┘
                               │
                         Ethernet LAN
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
        │  Client 1 │    │  Client 2 │    │  Client 3 │
        │ PXE Boot  │    │ PXE Boot  │    │ PXE Boot  │
        └───────────┘    └───────────┘    └───────────┘
```

The client first boots from PXE.

`dnsmasq` loads iPXE through TFTP. iPXE then downloads the boot script and Windows PE files through HTTP.

Windows PE connects to the SMB installation share and installs Windows directly onto the iSCSI master disk.

After the master image is prepared, clients can boot Windows from the network using iSCSI.

---

# Quick Start

## Requirements

### Server

- Linux server
- Static IP address
- Gigabit Ethernet recommended
- Sufficient storage for Windows images and client disks

This guide uses:

- Ubuntu Server 26.04
- `dnsmasq`
- `nginx`
- `samba`
- `ipxe`
- `targetcli-fb`
- LVM

### Technician Machine

A Windows machine used to prepare and maintain the Windows master image.

### Client

A desktop capable of PXE booting through the network interface.

> This guide currently uses **Legacy BIOS PXE** to avoid motherboard-specific UEFI firmware issues.

---

# 1. Prepare the Linux Server

## 1.1 Update the system

```bash
sudo apt update
sudo apt upgrade -y
```

Install the required packages:

```bash
sudo apt install dnsmasq nginx samba ipxe targetcli-fb -y
```

---

# 2. Configure the Network

Lanboot requires the server to have a static IP address on the client LAN.

Check the available network interfaces:

```bash
ip -br addr show
```

Example:

```text
lo       UNKNOWN 127.0.0.1/8
enp3s0   UP      192.168.100.243/24
```

For the remainder of this guide:

```text
Interface: enp3s0
Server IP: 192.168.100.243
Network:   192.168.100.0/24
```

Replace these values with your own network configuration where necessary.

---

# 3. Configure DHCP and PXE

Lanboot uses `dnsmasq` as a **proxy DHCP server**.

This allows an existing router to continue providing normal DHCP leases while Lanboot provides PXE information.

## 3.1 Stop dnsmasq

```bash
sudo systemctl stop dnsmasq.service
```

If an existing configuration is present, back it up:

```bash
sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.bak
```

Create the initial configuration:

```bash
cat << __EOF__ | sudo tee /etc/dnsmasq.conf > /dev/null
interface=enp3s0
bind-interfaces

dhcp-range=192.168.100.0,proxy,255.255.255.0

# Disable DNS
port=0
__EOF__
```

Start dnsmasq:

```bash
sudo systemctl enable --now dnsmasq.service
```

---

# 4. Configure TFTP

Create the TFTP root:

```bash
sudo mkdir -p /srv/tftp
```

Add TFTP configuration:

```bash
cat << __EOF__ | sudo tee -a /etc/dnsmasq.conf > /dev/null
enable-tftp
tftp-root=/srv/tftp
__EOF__
```

Restart dnsmasq:

```bash
sudo systemctl restart dnsmasq.service
```

---

# 5. Configure HTTP

Lanboot uses nginx to serve:

- iPXE scripts
- Windows PE files
- `wimboot`
- other boot resources

Create the directory structure:

```bash
sudo mkdir -p /var/www/html/ipxe/windows/winpe
```

The resulting structure will look like:

```text
/var/www/html/
└── ipxe/
    └── windows/
        └── winpe/
```

---

# 6. Configure SMB

SMB is used to provide the Windows installation files to Windows PE.

Create the shared directory:

```bash
sudo mkdir -p /srv/samba/shared
```

Set permissions:

```bash
sudo chown -R nobody:nogroup /srv/samba/shared
sudo chmod -R 755 /srv/samba/shared
```

Add the following share to `/etc/samba/smb.conf`:

```ini
[shared]
   path = /srv/samba/shared
   browseable = yes
   read only = no
   guest ok = yes
   create mask = 0755
   directory mask = 0755
```

Restart Samba:

```bash
sudo systemctl restart smbd
```

---

# 7. Prepare Windows Installation Files

Download a Windows ISO from Microsoft's official download page.

Place the ISO somewhere accessible to the server.

Example:

```text
~/Downloads/windows-10.iso
```

Create a temporary mount point:

```bash
sudo mkdir -p /tmp/windows
```

Mount the ISO:

```bash
sudo mount -o loop ~/Downloads/windows-10.iso /tmp/windows
```

Create the installation directory:

```bash
sudo mkdir -p /srv/samba/shared/installation/windows
```

Copy the installation files:

```bash
sudo rsync -avP /tmp/windows/ /srv/samba/shared/installation/windows/
```

Unmount the ISO:

```bash
sudo umount /tmp/windows
sudo rm -rf /tmp/windows
```

The Windows installer is now available through:

```text
\\192.168.100.243\shared\installation\windows
```

---

# 8. Prepare Windows PE

Lanboot uses `wimboot` to boot Windows PE through iPXE.

Download `wimboot` from the official iPXE project.

Place it in:

```text
/var/www/html/ipxe/windows/winpe/wimboot
```

Copy the required Windows PE files:

```text
/var/www/html/ipxe/windows/winpe/
├── media/
│   ├── boot/
│   │   ├── bcd
│   │   └── boot.sdi
│   └── sources/
│       └── boot.wim
└── wimboot
```

---

# 9. Create the Master Disk

Lanboot stores the Windows master image in an LVM logical volume.

## 9.1 Identify the storage device

```bash
lsblk
```

Example:

```text
sda
├─sda1
└─sda2

sdb
```

> **Warning:** The following steps destroy data on the selected disk. Make absolutely sure you have selected the correct device.

## 9.2 Partition the disk

For example:

```bash
sudo fdisk /dev/sdb
```

Create a single Linux partition covering the disk.

Verify:

```bash
sudo lsblk
```

Example:

```text
sdb
└─sdb1
```

## 9.3 Create the LVM physical volume

```bash
sudo pvcreate /dev/sdb1
```

Verify:

```bash
sudo pvs
```

## 9.4 Create the volume group

```bash
sudo vgcreate lanboot /dev/sdb1
```

Verify:

```bash
sudo vgs
```

## 9.5 Create the master logical volume

For example, create a 100 GB master disk:

```bash
sudo lvcreate -L 100G -n master lanboot
```

Verify:

```bash
sudo lvs
```

---

# 10. Expose the Master Disk Through iSCSI

Lanboot uses Linux LIO to expose the LVM logical volume as an iSCSI disk.

Create the block backstore:

```bash
sudo targetcli /backstores/block create master /dev/lanboot/master
```

Create the iSCSI target:

```bash
sudo targetcli /iscsi create iqn.2026-09.wawads.dev:master
```

Create the LUN:

```bash
sudo targetcli /iscsi/iqn.2026-09.wawads.dev:master/tpg1/luns create /backstores/block/master
```

Configure the target:

```bash
sudo targetcli /iscsi/iqn.2026-09.wawads.dev:master/tpg1 set authentication=0 demo_mode_write_protect=0 prod_mode_write_protect=0 gen_acls_node=1
```

Verify that the target is discoverable:

```bash
sudo iscsiadm -m discovery -t sendtargets -p 192.168.100.243:3260
```

Expected:

```text
192.168.100.243:3260,1 iqn.2026-09.wawads.dev:master
```

---

# 11. Create the Windows PE Installer

Windows PE needs to:

1. Initialize networking.
2. Wait for networking to become available.
3. Connect to the SMB share.
4. Start Windows Setup.

Create `install.bat`:

```bat
@echo off

wpeinit
wpeutil initializenetwork
wpeutil waitfornetwork

net use Z: \\192.168.100.243\shared

Z:\installation\windows\setup.exe /noreboot
```

Place it at:

```text
/var/www/html/ipxe/windows/winpe/install.bat
```

Create `winpeshl.ini`:

```ini
[LaunchApp]
"install.bat"
```

Place it at:

```text
/var/www/html/ipxe/windows/winpe/winpeshl.ini
```

---

# 12. Create the iPXE Boot Script

Create:

```text
/var/www/html/ipxe/boot.ipxe
```

Contents:

```ipxe
#!ipxe

dhcp net0

set net0/gateway 0.0.0.0
set keep-san 1
set next-server 192.168.100.243

sanhook -d 0x80 iscsi:${next-server}::::iqn.2026-09.wawads.dev:master

kernel http://${next-server}/ipxe/windows/winpe/wimboot index=1
initrd http://${next-server}/ipxe/windows/winpe/winpeshl.ini winpeshl.ini
initrd http://${next-server}/ipxe/windows/winpe/install.bat install.bat
initrd http://${next-server}/ipxe/windows/winpe/media/boot/bcd BCD
initrd http://${next-server}/ipxe/windows/winpe/media/boot/boot.sdi boot.sdi
initrd http://${next-server}/ipxe/windows/winpe/media/sources/boot.wim boot.wim

boot
```

The important part is:

```ipxe
sanhook -d 0x80 iscsi:${next-server}::::iqn.2026-09.wawads.dev:master
```

This makes the iSCSI master disk available to the Windows PE environment.

---

# 13. Configure iPXE PXE Chainloading

This guide uses Legacy BIOS PXE.

Create the TFTP directory:

```bash
sudo mkdir -p /srv/tftp/ipxe
```

Copy the iPXE BIOS network boot program:

```bash
sudo cp "$(dpkg -L undionly.kpxe | grep -m 1 '/undionly.kpxe$')" \
    /srv/tftp/ipxe/undionly.kpxe
```

Add the PXE configuration to `/etc/dnsmasq.conf`:

```ini
# Detect BIOS PXE clients
dhcp-match=set:bios,option:client-arch,0

# Detect iPXE
dhcp-userclass=set:ipxeclient,iPXE
dhcp-match=set:ipxeclient,175

# PXE firmware -> iPXE
dhcp-boot=tag:bios,tag:!ipxeclient,ipxe/undionly.kpxe
pxe-service=tag:bios,tag:!ipxeclient,X86PC,"iPXE (BIOS)",ipxe/undionly.kpxe

# iPXE -> boot script
dhcp-boot=tag:ipxeclient,http://192.168.100.243/ipxe/boot.ipxe
```

Restart dnsmasq:

```bash
sudo systemctl restart dnsmasq.service
```

---

# 14. Boot the Master Client

Connect the technician machine to the same LAN as the Lanboot server.

Enable PXE/network boot in the motherboard firmware.

The expected boot sequence is:

```text
BIOS
 │
 ▼
PXE
 │
 ▼
dnsmasq
 │
 ▼
undionly.kpxe
 │
 ▼
iPXE
 │
 ▼
boot.ipxe
 │
 ├──► iSCSI master disk
 │
 └──► Windows PE
          │
          ▼
       SMB share
          │
          ▼
     Windows Setup
          │
          ▼
      Master disk
```

Windows Setup should see the iSCSI disk as the installation destination.

Install Windows normally.

# 14.1 Remember the Windows partition labels

After installation Windows PE won't reboot since we run the setup.exe with /noreboot params.

```cmd
echo list volume > diskpart.txt

diskpart /s diskpart.txt
```

Example:

```cmd
Volume ###  Ltr  Label        Fs     Type        Size     Status     Info
----------  ---  -----------  -----  ----------  -------  ---------  --------
Volume 0     C   Windows      NTFS   Partition    99 GB   Healthy    Boot
Volume 1         System Rese  NTFS   Partition    500 MB  Healthy    System
```

# 14.2 Disable Paging Files and Shutdown the Windows PE

```cmd
reg load HKLM\OFFLINE_SYSTEM C:\Windows\System32\config\SYSTEM

reg add "HKLM\OFFLINE_SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management" /v PagingFiles /t REG_MULTI_SZ /d ""

reg unload HKLM\OFFLINE_SYSTEM

wpeutil shutdown
```

# 14.3 Update the iPXE Script to Boot Windows from the iSCSI Target

After Windows has been installed, replace the iPXE boot script with the following so the client boots directly from the iSCSI master disk as normal Windows:

```bash
cat << __EOF__
#!ipxe

dhcp net0

set net0/gateway 0.0.0.0
set keep-san 1
set next-server 192.168.100.243

sanboot -d 0x80 iscsi:${next-server}::::iqn.2026-09.wawads.dev:master
__EOF__ > /var/www/html/ipxe/boot.ipxe
```

---

# 15. Prepare the Master Image

After Windows has been installed:

1. Boot Windows from the iSCSI master disk.
2. Install required applications.
3. Install required drivers.
4. Allow Windows to populate its driver store.
5. Configure the system as the common client image.
6. If the clients use different hardware, boot the master image on each hardware configuration and allow Windows to populate the driver store with the appropriate drivers.
7. Shut down the machine before making further storage changes.

The master image is intended to be shared by clients with different hardware configurations.

Windows can automatically detect and install appropriate drivers when clients boot the image.

---

# 16. Client Boot

Once the master image is prepared, a client can boot from the same network infrastructure.

The basic flow is:

```text
Client
  │
  ▼
PXE
  │
  ▼
iPXE
  │
  ▼
Lanboot boot script
  │
  ▼
iSCSI
  │
  ▼
Windows master image
  │
  ▼
Windows
```

---

# Troubleshooting

## PXE client does not receive an iPXE boot file

Check:

```bash
sudo systemctl status dnsmasq
```

Check the interface:

```bash
ip -br addr show
```

Verify that the interface configured in `dnsmasq.conf` matches the interface connected to the client network.

---

## iPXE loads but the boot script does not

Test the HTTP server:

```bash
curl http://192.168.100.243/ipxe/boot.ipxe
```

If the script cannot be retrieved, check nginx:

```bash
sudo systemctl status nginx
```

---

## Windows PE does not start

Verify that all required files exist:

```text
wimboot
winpeshl.ini
install.bat
BCD
boot.sdi
boot.wim
```

---

## Windows PE cannot access the SMB share

Test the share from another machine:

```text
\\192.168.100.243\shared
```

Check Samba:

```bash
sudo systemctl status smbd
```

---

## iSCSI target cannot be discovered

Check the target:

```bash
sudo targetcli ls
```

Test discovery:

```bash
sudo iscsiadm -m discovery -t sendtargets -p 192.168.100.243:3260
```

---

# Architecture

Lanboot intentionally uses existing Linux infrastructure instead of implementing every protocol itself.

```text
                 Lanboot
                    │
       ┌────────────┼────────────┐
       │            │            │
     PXE           HTTP         iSCSI
       │            │            │
   dnsmasq        nginx        LIO
       │            │            │
      TFTP       WinPE files     LVM
       │
      iPXE
       │
       ▼
    Windows PE
       │
       ├────────── SMB ──────────► Samba
       │
       └───────── iSCSI ─────────► LVM
```

The goal is to keep Lanboot itself as an orchestration layer rather than replacing mature Linux networking and storage components.

---

# Current Limitations

- Legacy BIOS PXE is currently the primary supported boot method.
- UEFI support may depend on motherboard firmware.
- Client storage architecture is still under development.
- The master image is currently shared directly through iSCSI.
- Client-specific image management is not yet implemented.
- Caching and copy-on-write storage are future areas of development.

---

# Roadmap

- [ ] Client management
- [ ] Web management interface
- [ ] Automated iSCSI target creation
- [ ] LVM snapshot-based client images
- [ ] Client-specific boot configuration
- [ ] Image management
- [ ] Disk usage monitoring
- [ ] iPXE UEFI support
- [ ] Client caching
- [ ] Copy-on-write / overlay storage
- [ ] Automated Windows image preparation

---

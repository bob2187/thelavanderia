# Project Reference for Claude

## Overview
Ansible playbooks for Raspberry Pi and OpenWRT network infrastructure deployments.

## Ansible Installation
Ansible is installed via pip in the user's Python directory:
```bash
/Users/robertstephen/Library/Python/3.9/bin/ansible-playbook
```

To run playbooks:
```bash
cd /Users/robertstephen/thelavanderia
/Users/robertstephen/Library/Python/3.9/bin/ansible-playbook -i inventory/hosts.yml playbooks/<playbook>.yml
```

## Hosts

### Raspberry Pis (production_control group)
- **skinnypete**: 192.168.25.171 (LAN), user: heisenberg
- **hank**: 100.79.51.33 (Tailscale), user: heisenberg

### OpenWRT Routers (openwrt_routers group)
- **winnebago**: GL-BE3600 router
  - LAN IP: 192.168.8.1 (preferred for Tailscale updates)
  - Tailscale IP: 100.71.25.22
  - User: root
  - SSH key is installed in `/etc/dropbear/authorized_keys`

## OpenWRT/GL.iNET Notes

### SSH Configuration
- OpenWRT uses **dropbear** instead of OpenSSH
- SSH keys go in `/etc/dropbear/authorized_keys`
- Keys MUST be on a single line (no line breaks)
- No sftp-server installed (Ansible uses pipe fallback - warnings are harmless)

### Python for Ansible
OpenWRT needs Python installed for Ansible to work:
```bash
opkg update && opkg install python3 python3-urllib
```
The openwrt.yml playbook handles this automatically via a `raw` pre-task.

### musl vs glibc Limitation
OpenWRT uses **musl libc**, not glibc. Pre-compiled Linux binaries (like Companion) won't work without recompilation. This affects:
- Bitfocus Companion (won't run on OpenWRT)
- Companion Satellite (likely same issue)
- Any software with native Node.js modules

### Tailscale on GL.iNET
- Installed at: `/usr/sbin/tailscale`, `/usr/sbin/tailscaled`
- Init script: `/etc/init.d/tailscale`
- GL.iNET ships outdated versions; use `tailscale-openwrt` role to update from official builds
- Update via LAN IP to avoid losing connectivity mid-update

### Router Backup/Restore
```bash
# Backup
sysupgrade -b /tmp/backup.tar.gz

# Restore
sysupgrade -r /path/to/backup.tar.gz
```

## Playbooks

| Playbook | Target | Purpose |
|----------|--------|---------|
| `production-control.yml` | Raspberry Pis | Full setup: base, tailscale, rpiconnect, companion, network-api |
| `openwrt.yml` | OpenWRT routers | Python bootstrap + Tailscale updates |
| `pinn-image.yml` | Pi with USB SD reader | Prepare PINN SD cards with SSH, VNC, and Tailscale |

## Roles

### Raspberry Pi Roles
- `base` - Common packages, user setup
- `tailscale` - Tailscale VPN (Debian/Ubuntu)
- `rpiconnect` - Raspberry Pi Connect
- `companion` - Bitfocus Companion (GUI build)
- `network-api` - Custom network API module
- `pinn-image` - Prepare PINN SD cards for headless deployment

### OpenWRT Roles
- `tailscale-openwrt` - Updates Tailscale from official ARM64 static builds

## Key Files
- `inventory/hosts.yml` - All hosts and groups
- `inventory/group_vars/all.yml` - Variables for Pis (admin_user, companion_version, PINN config, Tailscale auth key)
- `inventory/group_vars/openwrt_routers.yml` - OpenWRT-specific vars (shell type, python path)

## PINN Image Preparation

### Overview
The `pinn-image` role prepares SD cards with PINN (multi-boot manager) pre-configured for headless operation with SSH, VNC, and Tailscale.

### Usage
Insert an SD card into a Pi's USB port (e.g., skinnypete), then run:
```bash
cd /Users/robertstephen/thelavanderia
/Users/robertstephen/Library/Python/3.9/bin/ansible-playbook -i inventory/hosts.yml playbooks/pinn-image.yml -e "confirm_device=yes" -e "tailscale_auth_key=tskey-auth-xxx"
```

### What It Does
1. Formats the SD card as FAT32
2. Downloads and extracts PINN
3. Configures `cmdline.txt` with SSH, VNC, and passwords
4. Installs Tailscale static binaries
5. Writes the Tailscale auth key

### Configuration Variables (in `group_vars/all.yml`)
| Variable | Purpose |
|----------|---------|
| `pinn_ssh_password` | SSH password for root user (default: bluesky) |
| `pinn_vnc_password` | VNC password (default: bluesky) |
| `tailscale_auth_key` | Reusable Tailscale auth key with `tag:pinn` |

### After Booting PINN
1. SSH to the Pi: `ssh root@<ip>` (password: bluesky)
2. Start Tailscale manually: `/mnt/mmcblk0p1/tailscale/init.sh`
3. Device appears in Tailscale admin as `pinn-XXXXXXXX` with `tag:pinn`

### Tailscale ACL Setup
The `tag:pinn` tag must be defined in your Tailscale ACL policy:
```json
{
  "tagOwners": {
    "tag:pinn": ["autogroup:admin"]
  }
}
```
Tagged devices have key expiry disabled - they stay connected indefinitely after registration.

### Target Device
Default target is `/dev/sda`. Override with:
```bash
-e "pinn_target_device=/dev/sdb"
```

### PINN Headless Operation
- **SSH**: `root@<ip>` with configured password
- **VNC**: Port 5900 with configured password (view PINN GUI remotely)
- **Tailscale**: After running init script, accessible via Tailscale IP

## Troubleshooting

### SSH host key issues
Each IP needs its host key accepted separately:
```bash
ssh -o StrictHostKeyChecking=accept-new user@host "echo connected"
```

### Ansible "not found" errors on OpenWRT
Usually means Python isn't installed. The playbook pre-task handles this, but manually:
```bash
ssh root@192.168.8.1 "opkg update && opkg install python3 python3-urllib"
```

### sftp/scp warnings
Safe to ignore. OpenWRT lacks sftp-server; Ansible falls back to piping through SSH.

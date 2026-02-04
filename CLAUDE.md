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
- **skinnypete**: 192.168.25.172 (WiFi), user: heisenberg
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
| `imaging.yml` | localhost | Create customized Pi image from virgin base |
| `production-control.yml` | Raspberry Pis | Full setup: base, tailscale, rpiconnect, network-api |
| `openwrt.yml` | OpenWRT routers | Python bootstrap + Tailscale updates |

## Imaging Playbook

Creates customized Raspberry Pi OS images without modifying the virgin base. Pulls configuration from standard Ansible inventory.

### Usage
```bash
cd /Users/robertstephen/thelavanderia
/Users/robertstephen/Library/Python/3.9/bin/ansible-playbook -i inventory/hosts.yml playbooks/imaging.yml -e "target_host=skinnypete"
```

The `target_host` must exist in `inventory/hosts.yml`. Variables are pulled from:
- `inventory/group_vars/all.yml` - shared defaults (admin_user, password hash)
- `inventory/group_vars/production_control.yml` - imaging defaults (timezone, SSH, VNC)
- `inventory/host_vars/<target_host>.yml` - host-specific (WiFi credentials, overrides)

### Inventory Variables for Imaging

**Group defaults** (`group_vars/production_control.yml`):
| Variable | Default | Purpose |
|----------|---------|---------|
| `imaging_timezone` | America/Chicago | Timezone |
| `imaging_locale` | en_US.UTF-8 | Locale |
| `imaging_ssh_password_auth` | true | Allow SSH password login |
| `imaging_vnc_enabled` | true | Enable VNC |
| `imaging_wifi_country` | US | WiFi regulatory domain |

**Host-specific** (`host_vars/<hostname>.yml`):
| Variable | Purpose |
|----------|---------|
| `imaging_wifi_ssid` | WiFi network name |
| `imaging_wifi_password` | WiFi password |
| `imaging_vnc_password` | VNC password (8 char max) |
| `imaging_extra_packages` | Additional packages to install |
| `imaging_runcmd` | Commands to run on first boot |

### Image Files
```
images/
├── *-base.img           # Virgin base image (NEVER modified)
├── raspios-<hostname>.img  # Customized output images
└── *.img.xz             # Compressed download backup
```

### What Gets Configured

The imaging playbook writes multiple config files to the boot partition:

| File | Handles | Notes |
|------|---------|-------|
| `user-data` | User, SSH keys, hostname, WiFi, timezone | cloud-init format, WiFi via runcmd |
| `network-config` | Ethernet (DHCP) | cloud-init format |
| `meta-data` | Instance ID, hostname | cloud-init format |
| `ssh` | Enable SSH on first boot | Empty file |

**Important**: WiFi is configured via cloud-init `runcmd` using `nmcli`. Raspberry Pi OS Trixie uses NetworkManager (not wpa_supplicant), and WiFi radio is disabled by default.

### After Flashing

1. Flash image with Raspberry Pi Imager (Use custom → skip OS customization)
2. Boot the Pi
3. Wait ~2-3 minutes for first boot + cloud-init
4. Connect via: `ssh heisenberg@<hostname>` or VNC to `<hostname>:5900`

## Roles

### Raspberry Pi Roles
- `base` - Common packages, user setup
- `tailscale` - Tailscale VPN (Debian/Ubuntu)
- `rpiconnect` - Raspberry Pi Connect
- `companion` - Bitfocus Companion (GUI build) - currently broken
- `network-api` - Custom network API module
- `pi-image` - Write cloud-init config to Pi images

### OpenWRT Roles
- `tailscale-openwrt` - Updates Tailscale from official ARM64 static builds

## Key Files

### Inventory Structure
```
inventory/
├── hosts.yml                      # All hosts and groups
├── group_vars/
│   ├── all.yml                    # Shared: admin_user, password hash, Tailscale key
│   ├── production_control.yml     # Pi imaging defaults: timezone, SSH, VNC
│   └── openwrt_routers.yml        # OpenWRT: shell type, python path
└── host_vars/
    ├── skinnypete.yml             # WiFi credentials, host-specific config
    └── hank.yml                   # (create as needed)
```

### Image Files
```
images/
├── 2025-12-04-raspios-trixie-arm64-base.img   # Virgin base (never modify)
├── raspios-skinnypete.img                      # Customized for skinnypete
└── *.img.xz                                    # Compressed backup
```

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

### Pi won't connect to WiFi after imaging
- **Raspberry Pi OS Trixie uses NetworkManager**, not wpa_supplicant
- WiFi radio is **disabled by default** - must run `nmcli radio wifi on` first
- WiFi is configured via cloud-init `runcmd` using `nmcli device wifi connect`
- The imaging playbook handles this automatically in user-data
- To debug: connect via ethernet and check `nmcli radio` and `nmcli device status`

### Pi not reachable after first boot
- Wait 2-3 minutes for cloud-init to complete
- Try mDNS: `ping <hostname>.local`
- If ethernet connected, check link-local: `ping 169.254.x.x`
- Check router DHCP client list for new devices

### Cloud-init not running
- Verify `user-data`, `meta-data`, and `network-config` exist in boot partition
- Check cloud-init logs: `sudo cat /var/log/cloud-init-output.log`
- Errors like "No access points defined" = bad network-config format (use wpa_supplicant.conf instead)

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
/Users/robertstephen/Library/Python/3.9/bin/ansible-playbook playbooks/<playbook>.yml
```

## Ansible Vault

Sensitive data (passwords, WiFi credentials) is encrypted with Ansible Vault.

### Vault Structure
```
inventory/
├── group_vars/
│   ├── all/
│   │   ├── vars.yml      # Public variables
│   │   └── vault.yml     # Encrypted: vault_admin_password_hash
│   ├── production_control/
│   │   ├── vars.yml      # Imaging defaults, tailscale_accept_routes
│   │   └── vault.yml     # Encrypted: vault_imaging_plain_password
│   └── openwrt_routers.yml
└── host_vars/
    ├── skinnypete.yml           # References vault variables
    └── skinnypete_vault.yml     # Encrypted: WiFi/VNC passwords
```

### Vault Password
Stored in `.vault_pass` (gitignored). Ansible auto-loads it via `ansible.cfg`.

### Editing Vault Files
```bash
/Users/robertstephen/Library/Python/3.9/bin/ansible-vault edit inventory/group_vars/all/vault.yml
```

## Hosts

### Raspberry Pis (production_control group)
- **skinnypete**: 100.105.164.64 (Tailscale), 192.168.25.172 (WiFi), user: heisenberg
- **hank**: 100.79.51.33 (Tailscale), user: heisenberg

### OpenWRT Routers (openwrt_routers group)
- **winnebago**: GL-BE3600 router
  - LAN IP: 192.168.8.1 (preferred for Tailscale updates)
  - Tailscale IP: 100.71.25.22
  - User: root
  - SSH key is installed in `/etc/dropbear/authorized_keys`

### Cloud VMs (cloud_vms group)
- **vultr**: Debian 12 VM on Vultr
  - Public IP: 155.138.253.242
  - Tailscale IP: 100.90.33.88
  - User: root
  - Purpose: Unity Intercom relay - forwards port 20101 to Mac Mini (100.109.197.33)

## Playbooks

| Playbook | Target | Purpose |
|----------|--------|---------|
| `imaging.yml` | localhost | Create customized Pi image from virgin base |
| `production-control.yml` | Raspberry Pis | Full setup: base, tailscale, rpiconnect, network-api |
| `openwrt.yml` | OpenWRT routers | Python bootstrap + Tailscale updates |
| `vultr.yml` | Vultr VM | Tailscale + Unity Intercom port forwarding |

### Running Playbooks

```bash
# Standard run (uses Tailscale IP from inventory)
/Users/robertstephen/Library/Python/3.9/bin/ansible-playbook playbooks/production-control.yml --limit skinnypete

# First-time setup via local IP (before Tailscale)
/Users/robertstephen/Library/Python/3.9/bin/ansible-playbook playbooks/production-control.yml --limit skinnypete -e "ansible_host=192.168.25.172" --ask-pass --ask-become-pass

# Skip specific roles
/Users/robertstephen/Library/Python/3.9/bin/ansible-playbook playbooks/production-control.yml --limit skinnypete --skip-tags network-api

# Force Tailscale re-authentication
/Users/robertstephen/Library/Python/3.9/bin/ansible-playbook playbooks/production-control.yml --limit skinnypete -e "tailscale_force_reauth=true"
```

### Cloud VM Deployment

For new cloud VMs, use an auth key for automated Tailscale setup:

1. Generate an auth key at https://login.tailscale.com/admin/settings/keys
2. Store in vault: `inventory/group_vars/cloud_vms/vault.yml`
   ```yaml
   vault_tailscale_auth_key: "tskey-auth-xxx"
   ```
3. Uncomment `tailscale_auth_key` in `inventory/group_vars/cloud_vms/vars.yml`
4. Run playbook with public IP:
   ```bash
   /Users/robertstephen/Library/Python/3.9/bin/ansible-playbook playbooks/vultr.yml -e "ansible_host=<PUBLIC_IP>" --ask-pass
   ```

## Roles

### base
- Sets hostname
- Updates apt and upgrades packages
- Creates admin user (heisenberg) with passwordless sudo
- Auto-detects and removes non-admin users (UID >= 1000)
- Deploys SSH authorized keys
- Enables SSH, VNC, and auto-login to desktop

### tailscale
- Installs Tailscale VPN
- **Interactive authentication**: Displays login URL, waits for user to authenticate
- Auto-detects if offline and re-authenticates
- Supports `tailscale_force_reauth=true` to force re-authentication
- Supports `tailscale_auth_key` for automated auth (store in vault)

### tailscale-autoroute
- Automatically advertises local subnets
- Enables exit node capability
- Configures IP forwarding

**Important**: `tailscale_accept_routes: false` (default for production_control) prevents routing conflicts when the Pi is on a local network. Set to `true` in host_vars if the Pi needs to reach other Tailscale subnets.

### rpiconnect
- Installs Raspberry Pi Connect
- **Interactive authentication**: Displays login URL, waits for user to authenticate
- Supports `skip` to skip authentication

### companion (currently broken)
- Bitfocus Companion (GUI build)

### network-api
- Flask REST API for network configuration
- Companion module for button control

### pi-image
- Writes cloud-init config to Pi images for imaging.yml playbook

### tailscale-openwrt
- Updates Tailscale on GL.iNET routers from official ARM64 static builds

### unity-relay
- Configures iptables NAT rules for port forwarding via Tailscale
- Forwards Unity Intercom traffic from public IP to Mac Mini
- Variables:
  - `unity_relay_target_ip`: Tailscale IP of destination (default: 100.109.197.33)
  - `unity_relay_ports`: List of ports to forward (default: [20101])

## Inventory Variables

### Key Variables (group_vars/all/vars.yml)
| Variable | Purpose |
|----------|---------|
| `admin_user` | Username for all Pis (heisenberg) |
| `admin_password_hash` | Password hash (from vault) |
| `admin_ssh_keys` | SSH public keys to deploy |
| `remove_old_users` | Auto-remove non-admin users (default: true) |

### Tailscale Variables (group_vars/production_control/vars.yml)
| Variable | Default | Purpose |
|----------|---------|---------|
| `tailscale_accept_routes` | false | Accept subnet routes from other nodes |
| `tailscale_auth_key` | "" | Auth key for automated signin |
| `tailscale_force_reauth` | false | Force re-authentication |

### Imaging Variables (group_vars/production_control/vars.yml)
| Variable | Default | Purpose |
|----------|---------|---------|
| `imaging_timezone` | America/Chicago | Timezone |
| `imaging_locale` | en_US.UTF-8 | Locale |
| `imaging_ssh_password_auth` | true | Allow SSH password login |
| `imaging_vnc_enabled` | true | Enable VNC |
| `imaging_wifi_country` | US | WiFi regulatory domain |

### Host-specific (host_vars/<hostname>.yml)
| Variable | Purpose |
|----------|---------|
| `imaging_wifi_ssid` | WiFi network name |
| `imaging_wifi_password` | WiFi password (from vault) |
| `imaging_vnc_password` | VNC password (from vault) |
| `local_ip` | Local network IP (for override) |

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
OpenWRT uses **musl libc**, not glibc. Pre-compiled Linux binaries (like Companion) won't work without recompilation.

### Tailscale on GL.iNET
- Installed at: `/usr/sbin/tailscale`, `/usr/sbin/tailscaled`
- Init script: `/etc/init.d/tailscale`
- GL.iNET ships outdated versions; use `tailscale-openwrt` role to update
- Update via LAN IP to avoid losing connectivity mid-update

### Router Backup/Restore
```bash
# Backup
sysupgrade -b /tmp/backup.tar.gz

# Restore
sysupgrade -r /path/to/backup.tar.gz
```

## Imaging Playbook

Creates customized Raspberry Pi OS images without modifying the virgin base.

### Usage
```bash
/Users/robertstephen/Library/Python/3.9/bin/ansible-playbook playbooks/imaging.yml -e "target_host=skinnypete"
```

### Image Files
```
images/
├── *-base.img              # Virgin base image (NEVER modified)
├── raspios-<hostname>.img  # Customized output images
└── *.img.xz                # Compressed backup
```

### After Flashing
1. Flash image with Raspberry Pi Imager (Use custom → skip OS customization)
2. Boot the Pi
3. Wait ~2-3 minutes for first boot + cloud-init
4. Connect via: `ssh heisenberg@<hostname>` or VNC to `<hostname>:5900`

## Troubleshooting

### SSH host key issues
```bash
ssh -o StrictHostKeyChecking=accept-new user@host "echo connected"
```

### Tailscale shows offline but logged in
Run `sudo tailscale up --accept-routes=false` to reconnect. The playbook handles this automatically.

### Local IP unreachable after Tailscale setup
If `tailscale_accept_routes: true`, the Pi may route local traffic through Tailscale. Set `tailscale_accept_routes: false` in group_vars.

### Pi won't connect to WiFi after imaging
- Raspberry Pi OS Trixie uses NetworkManager, not wpa_supplicant
- WiFi radio is disabled by default - cloud-init enables it
- Debug: `nmcli radio` and `nmcli device status`

### RPI Connect signin fails
Restart the service before signin:
```bash
systemctl --user restart rpi-connect
rpi-connect signin
```

### Ansible "not found" errors on OpenWRT
Python isn't installed:
```bash
ssh root@192.168.8.1 "opkg update && opkg install python3 python3-urllib"
```

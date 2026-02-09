# Project Reference for Claude

## Overview
Ansible playbooks for Raspberry Pi, OpenWRT, and cloud VM network infrastructure deployments. All devices are connected via Tailscale VPN.

## Project Structure
```
thelavanderia/
├── ansible.cfg                         # Ansible config (roles path, inventory, vault)
├── CLAUDE.md                           # This file
├── README.md                           # Brief project overview
├── .gitignore                          # Ignores: .DS_Store, companion binary, .vault_pass
├── playbooks/
│   ├── production-control.yml          # Raspberry Pi full setup
│   ├── imaging.yml                     # Pi image customization (runs on localhost)
│   ├── openwrt.yml                     # OpenWRT router setup
│   └── vultr.yml                       # Cloud VM setup
├── roles/
│   ├── base/                           # Pi base OS setup
│   ├── base-openwrt/                   # OpenWRT base setup + Samba macOS fix
│   ├── base-cloud/                     # Cloud VM SSH hardening
│   ├── companion/                      # Bitfocus Companion (currently broken)
│   ├── desktop/                        # Desktop wallpaper customization
│   ├── network-api/                    # Flask REST API for network config
│   ├── pi-image/                       # Cloud-init image injection
│   ├── rpiconnect/                     # Raspberry Pi Connect
│   ├── tailscale/                      # Tailscale VPN installation
│   ├── tailscale-autoroute/            # Auto subnet route advertising
│   ├── tailscale-openwrt/              # Tailscale updates for OpenWRT
│   └── unity-relay/                    # Unity Intercom port forwarding
├── inventory/
│   ├── hosts.yml                       # Host definitions (3 groups)
│   ├── group_vars/
│   │   ├── all/
│   │   │   ├── vars.yml                # Global variables
│   │   │   └── vault.yml              # ENCRYPTED
│   │   ├── production_control/
│   │   │   ├── vars.yml                # Imaging + Tailscale defaults
│   │   │   └── vault.yml              # ENCRYPTED
│   │   ├── cloud_vms/
│   │   │   ├── vars.yml                # Cloud VM Tailscale settings
│   │   │   └── vault.yml              # ENCRYPTED
│   │   └── openwrt_routers/
│   │       └── vars.yml                # Shell type, Python path, password ref
│   └── host_vars/
│       ├── skinnypete/
│       │   ├── vars.yml                # WiFi/VNC config
│       │   └── vault.yml             # ENCRYPTED
│       ├── winnebago/
│       │   ├── vars.yml                # Router model/arch (GL-BE3600)
│       │   └── vault.yml             # ENCRYPTED
│       ├── gl-ax1800/
│       │   ├── vars.yml                # Router model/arch (GL-AX1800)
│       │   └── vault.yml             # ENCRYPTED
│       └── gl-ax1800-ap1/
│           ├── vars.yml                # Router model/arch (GL-AX1800), tailscale_managed: false
│           └── vault.yml             # ENCRYPTED
├── companion-module-network-api/       # Companion module source (TypeScript)
│   ├── src/                            # index.ts, minimal.ts
│   ├── companion/                      # manifest.json
│   └── package.json                    # Node 22, nodejs-ipc
├── docs/
│   └── companion-setup.md             # Companion button grid setup guide
└── images/                             # Pi OS images (not in repo)
```

## AI Assistant Guidelines

### Safety Rules
- **NEVER** decrypt, display, or modify vault files (*.vault.yml, *_vault.yml). These contain passwords, WiFi credentials, and auth keys.
- **NEVER** commit `.vault_pass` or any file containing plaintext secrets.
- **NEVER** modify `ansible.cfg` vault_password_file path without explicit request.
- When editing roles, be aware that `network-api` protects `wlan0`, `tailscale0`, and `lo` interfaces — only `eth0` can be modified via the API.

### Conventions
- All Raspberry Pi hosts use `heisenberg` as the admin user.
- Vault-encrypted variables are prefixed with `vault_` and referenced via Jinja2 (e.g., `"{{ vault_admin_password_hash }}"`).
- Public variables go in `vars.yml`, secrets go in `vault.yml` within the same directory.
- Tags on roles match role names (e.g., `--skip-tags network-api` skips that role).
- Tailscale IPs (100.x.x.x) are the default `ansible_host` for remote management.
- Roles that require interactive browser auth (tailscale, rpiconnect) display a URL and wait.
- The `tailscale-autoroute` role is conditional: only runs when `tailscale_autoroute: true` is set on the host.

### Working with This Repo
- Run `ansible-playbook` with `--limit <host>` to target specific hosts.
- Use `-e "variable=value"` to override variables at runtime.
- Use `--skip-tags <tag>` to skip specific roles in a playbook.
- Use `--check` for dry-run mode.
- Test YAML syntax before committing: ensure proper indentation (2 spaces) and valid Jinja2 references.

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
│   ├── cloud_vms/
│   │   ├── vars.yml      # Cloud VM defaults
│   │   └── vault.yml     # Encrypted: vault_tailscale_auth_key
│   └── openwrt_routers/
│       └── vars.yml      # Shell type, Python path, password ref
└── host_vars/
    ├── skinnypete/
    │   ├── vars.yml             # WiFi/VNC config references
    │   └── vault.yml            # Encrypted: WiFi/VNC passwords
    ├── winnebago/
    │   ├── vars.yml             # Router model/arch metadata
    │   └── vault.yml            # Encrypted: vault_openwrt_root_password
    ├── gl-ax1800/
    │   ├── vars.yml             # Router model/arch metadata
    │   └── vault.yml            # Encrypted: vault_openwrt_root_password
    └── gl-ax1800-ap1/
        ├── vars.yml             # Router model/arch, tailscale_managed: false
        └── vault.yml            # Encrypted: vault_openwrt_root_password
```

### Vault Password
Stored in `.vault_pass` (gitignored). Ansible auto-loads it via `ansible.cfg`.

### Editing Vault Files
```bash
/Users/robertstephen/Library/Python/3.9/bin/ansible-vault edit inventory/group_vars/all/vault.yml
```

## Hosts

### Raspberry Pis (production_control group)
- **skinnypete**: 100.105.164.64 (Tailscale), 192.168.25.172 (WiFi), user: heisenberg, tailscale_autoroute: true
- **hank**: 100.79.51.33 (Tailscale), user: heisenberg, tailscale_autoroute: true

### OpenWRT Routers (openwrt_routers group)
- **winnebago**: GL-BE3600 router, location: Travel
  - LAN IP: 192.168.8.1 (preferred for Tailscale updates)
  - Tailscale IP: 100.93.112.62
  - User: root
  - SSH key is installed in `/etc/dropbear/authorized_keys`
- **gl-ax1800**: GL-AX1800 router, location: HMO
  - LAN IP: 192.168.25.1
  - Tailscale IP: 100.121.163.68
  - User: root
- **gl-ax1800-ap1**: GL-AX1800 AP in bridge mode, location: HMO
  - LAN IP: 192.168.25.167
  - No Tailscale (`tailscale_managed: false`)
  - User: root

### Cloud VMs (cloud_vms group)
- **vultr**: Debian 12 VM on Vultr
  - Public IP: 155.138.253.242
  - Tailscale IP: 100.90.33.88
  - Tailscale hostname: vultr-unity-relay
  - DNS: unity.showdropgo.io → 155.138.253.242
  - User: root
  - Purpose: Unity Intercom relay - forwards port 20101 to Mac Mini (100.109.197.33)
  - **Vultr Firewall Group** (`unity-relay`):
    | Protocol | Port | Purpose |
    |----------|------|---------|
    | TCP | 20101 | Unity Intercom |
    | UDP | 20101 | Unity Intercom |
    | UDP | 41641 | Tailscale direct connections |
  - SSH access: Tailscale only (port 22 blocked on public IP)
  - Emergency access: Open port 22 in Vultr firewall, or use Vultr web console

## Playbooks

| Playbook | Target | Roles | Purpose |
|----------|--------|-------|---------|
| `production-control.yml` | Raspberry Pis | base, desktop, tailscale, tailscale-autoroute*, rpiconnect, network-api | Full Pi setup (*autoroute only when enabled per host) |
| `imaging.yml` | localhost | pi-image | Create customized Pi image from virgin base |
| `openwrt.yml` | OpenWRT routers | (raw bootstrap) + base-openwrt, tailscale-openwrt | Python bootstrap + base config + Tailscale updates |
| `vultr.yml` | Vultr VM | base-cloud, tailscale, unity-relay | SSH hardening + Tailscale + Unity Intercom forwarding |

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
- Sets hostname and updates /etc/hosts
- Refreshes NodeSource GPG key
- Updates apt and upgrades packages
- Creates admin user (heisenberg) with passwordless sudo
- Auto-detects and removes non-admin users (UID >= 1000)
- Deploys SSH authorized keys
- Enables SSH, VNC, and auto-login to desktop via lightdm

### desktop
- Deploys host-specific wallpaper images
- Looks for `roles/desktop/files/<hostname>_desktop.{png,jpg,jpeg}`
- Configures PCManFM wallpaper for LXDE-pi desktop
- Places wallpaper in `~/Pictures/wallpapers/`

### tailscale
- Installs Tailscale VPN from official install script
- **Interactive authentication**: Displays login URL, waits for user to authenticate
- Auto-detects login state and online status; re-authenticates if offline
- Supports `tailscale_force_reauth=true` to force re-authentication
- Supports `tailscale_auth_key` for automated auth (store in vault)
- Configurable `tailscale_accept_routes` (default: false)

### tailscale-autoroute
- Automatically detects local subnets and advertises them via Tailscale
- Enables exit node capability
- Configures IP forwarding (IPv4/IPv6) and UDP GRO
- Installs systemd service for boot-time route updates
- Hooks into networkd-dispatcher and NetworkManager for network change events
- Tracks state in `/var/lib/tailscale-autoroute/last-routes`
- Only runs when `tailscale_autoroute: true` is set on the host

**Important**: `tailscale_accept_routes: false` (default for production_control) prevents routing conflicts when the Pi is on a local network. Set to `true` in host_vars if the Pi needs to reach other Tailscale subnets.

### rpiconnect
- Installs Raspberry Pi Connect
- **Interactive authentication**: Displays login URL, waits for user to authenticate
- Enables user lingering for persistent session
- Background signin with URL extraction and online verification
- Supports `skip` to skip authentication

### companion (currently broken)
- Bitfocus Companion (GUI build)
- Commented out in production-control.yml
- Installs from pre-built tar.gz binary
- Creates autostart desktop entry, accessible at `http://<hostname>:8000`

### network-api
- Flask REST API (`network-api.py`) for NetworkManager-based network configuration
- Endpoints: `/status`, `/display`, `/mode/<mode>`, `/ip/{0-3}/up|down`, `/preset/<name>`, `/apply`, `/recovery`, `/state/*`
- Modes: DHCP, Static, Server, Link-Local
- Only eth0 is modifiable; wlan0, tailscale0, and lo are protected
- Tracks pending vs applied configuration state
- Includes Companion module (`roles/network-api/files/network-api-module/`) for button control
- See `docs/companion-setup.md` for the 8x4 button grid layout guide

### pi-image
- Writes cloud-init config (user-data, network-config) to Pi images
- Mounts images locally (macOS: hdiutil, Linux: losetup)
- Configures hostname, user, SSH, VNC, WiFi for first boot
- Disables cloud-init after first boot
- Templates: `user-data.j2`, `user-data-minimal.j2`, `network-config.j2`

### base-openwrt
- Base setup for OpenWRT/GL.iNET routers
- Sets hostname via UCI
- Deploys SSH authorized keys to dropbear
- Fixes Samba `smb.conf.template` for macOS compatibility: patches veto files to include all `._*` AppleDouble resource forks (not just `._.DS_Store`), enabling proper file/directory deletion from macOS SMB clients
- Idempotent: checks before patching, only restarts Samba if changed

### tailscale-openwrt
- Updates Tailscale on GL.iNET routers from official static builds
- Uses `router_arch` host var to download correct architecture (arm, arm64, etc.)
- Checks current version against latest release via Tailscale API
- Downloads tarball on **localhost** (not the router) to avoid overlay space issues
- Stages binaries to `/tmp` (tmpfs) on the router, then does atomic stop → swap → start
- Skipped when `tailscale_managed: false` (e.g., bridge-mode APs)
- **Run with LAN IP** to avoid losing connectivity: `-e "ansible_host=<LAN_IP>"`
- **Important**: `router_arch` must match Tailscale's naming: `arm` (armv7l/32-bit), `arm64` (aarch64/64-bit). The GL-AX1800 runs a 32-bit kernel (`arm`) despite the SoC supporting 64-bit.

### base-cloud
- Base setup for cloud VMs (Vultr, etc.)
- Sets hostname and updates /etc/hosts
- Deploys SSH authorized keys from `admin_ssh_keys`
- Hardens SSH: disables password auth, disables empty passwords
- Variables:
  - `ssh_password_auth`: Enable/disable password auth (default: false)
  - `ssh_permit_root_login`: Root login policy (default: prohibit-password)
  - `cloud_ssh_user`: User for SSH key deployment (default: root)

### unity-relay
- Configures iptables NAT rules for port forwarding via Tailscale
- Forwards Unity Intercom traffic (TCP + UDP) from public IP to Mac Mini
- Client connects to: `unity.showdropgo.io:20101`
- Installs iptables-persistent for rule persistence
- Enables IP forwarding via sysctl
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
| `companion_version` | Bitfocus Companion version (v4.2.2) |
| `tailscale_auth_key` | Tailscale auth key, pass via `-e` or vault (default: empty) |

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
| `imaging_keyboard_layout` | us | Keyboard layout |
| `imaging_ssh_password_auth` | true | Allow SSH password login |
| `imaging_ssh_pubkey_auth` | true | Allow SSH pubkey login |
| `imaging_ssh_permit_root` | false | Allow root SSH login |
| `imaging_plain_password` | (from vault) | Plain text password for cloud-init first boot |
| `imaging_vnc_enabled` | true | Enable VNC |
| `imaging_vnc_password` | "" | VNC password (set per-host) |
| `imaging_wifi_country` | US | WiFi regulatory domain |
| `imaging_wifi_ssid` | "" | WiFi SSID (set per-host) |
| `imaging_wifi_password` | "" | WiFi password (set per-host) |
| `imaging_extra_packages` | [] | Additional packages to install on first boot |
| `imaging_runcmd` | [] | Commands to run on first boot |

### Host-specific (host_vars/<hostname>/vars.yml)
| Variable | Purpose |
|----------|---------|
| `imaging_wifi_ssid` | WiFi network name |
| `imaging_wifi_password` | WiFi password (from vault) |
| `imaging_vnc_password` | VNC password (from vault) |
| `local_ip` | Local network IP (for override) |
| `tailscale_autoroute` | Enable auto subnet route advertising (default: false) |

### OpenWRT Router Variables (host_vars/<router>/vars.yml)
| Variable | Purpose |
|----------|---------|
| `router_model` | Hardware model (e.g., GL-BE3600, GL-AX1800) |
| `router_brand` | Manufacturer (GL.iNET) |
| `router_arch` | Tailscale tarball arch: `arm` (GL-AX1800, armv7l kernel) or `arm64` (GL-BE3600, aarch64 kernel) |
| `tailscale_managed` | Set to false on APs without Tailscale (overrides group default) |

### OpenWRT Group Variables (group_vars/openwrt_routers/vars.yml)
| Variable | Purpose |
|----------|---------|
| `openwrt_root_password` | Root password (from per-host vault) |
| `ansible_password` | SSH auth password (from per-host vault, enables passwordless deploys) |
| `tailscale_managed` | Whether to manage Tailscale on this host (default: true) |
| `ansible_remote_tmp` | Temp dir on router — set to /tmp/.ansible/tmp (tmpfs) to avoid full overlay |
| `ansible_shell_type` | Shell type (sh for ash) |
| `ansible_python_interpreter` | Python path (/usr/bin/python3) |

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

### Overlay Disk Space
- OpenWRT overlay filesystem is small (~57MB) and often nearly full
- `ansible_remote_tmp: /tmp/.ansible/tmp` directs Ansible temp files to tmpfs (RAM) instead of overlay
- **Never download large files directly to the router** — download on localhost and push binaries via `copy`
- To free overlay space: `opkg remove <package>` (but packages on overlay are small)
- `/tmp` is tmpfs (RAM-backed, ~196MB) — safe for staging large files

### musl vs glibc Limitation
OpenWRT uses **musl libc**, not glibc. Pre-compiled Linux binaries (like Companion) won't work without recompilation.

### Tailscale on GL.iNET
- Installed at: `/usr/sbin/tailscale`, `/usr/sbin/tailscaled`
- Init script: `/etc/init.d/tailscale`
- GL.iNET ships outdated versions; use `tailscale-openwrt` role to update
- Update via LAN IP to avoid losing connectivity mid-update

### Samba/SMB Shares
- GL.iNET routers use Samba config template at `/etc/samba/smb.conf.template`
- USB drives are mounted at `/tmp/mountd/<partition>` (e.g., `/tmp/mountd/disk1_part1`)
- exFAT filesystems don't support xattrs, so `streams_xattr` VFS module can't store macOS resource forks — macOS falls back to `._*` AppleDouble files
- The default veto files list only blocks `._.DS_Store`, not all `._*` files — this causes "Directory not empty" errors when deleting from macOS
- The `base-openwrt` role patches this to veto all `._*` files with `delete veto files = yes`
- Share config is in `/etc/config/samba4` (UCI), template is `/etc/samba/smb.conf.template`

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

## Security To-Do

### Vultr VM (vultr-unity-relay)
- [ ] Enable `unattended-upgrades` for automatic security patches
- [ ] Install `fail2ban` for SSH brute force protection
- [ ] Add iptables rate limiting on port 20101 (prevent DDoS/brute force)
  ```bash
  iptables -A INPUT -p tcp --dport 20101 -m connlimit --connlimit-above 20 -j DROP
  ```

### Tailscale
- [ ] Configure ACLs to restrict device-to-device access
- [ ] Use tags to group devices by role (admin, relay, endpoint)
- [ ] Review device key expiry settings

### Monitoring
- [ ] Set up alerts for SSH logins
- [ ] Monitor Unity Intercom service health

## Future Ideas

### Open Source Intercom Alternative
Explore building a custom intercom solution based on open source projects:
- **Mumble** (BSD license) - Low-latency (~30-50ms), self-hostable, mobile apps exist
- **LiveKit** (Apache 2.0) - Modern, good SDKs, ~50-100ms latency
- **Jitsi** (Apache 2.0) - WebRTC-based, easier to embed

Benefits:
- Integrate Tailscale directly (no public port exposure)
- Brand as ShowDropGo Intercom
- Full control over features and security
- Legal: BSD/Apache allow commercial use, modification, distribution

See also: Wrapper app approach to add VPN tunnel to existing Unity client without reverse engineering.

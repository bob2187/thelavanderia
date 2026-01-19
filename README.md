# thelavanderia

Ansible playbooks for Raspberry Pi and network infrastructure deployments.

## Flavors

- **production-control** - Remote production control for live/streamed events (Raspberry Pi)
- **openwrt** - OpenWRT router configuration

## Usage

```bash
# Raspberry Pi production control
ansible-playbook -i inventory/hosts.yml playbooks/production-control.yml

# OpenWRT routers
ansible-playbook -i inventory/hosts.yml playbooks/openwrt.yml
```

## Roles

### Raspberry Pi
- `base` - Common packages and settings for all Pis
- `tailscale` - Tailscale VPN (Debian/Ubuntu)
- `vnc` - VNC remote desktop
- `companion` - Bitfocus Companion

### OpenWRT
- `tailscale-openwrt` - Update Tailscale to latest version from official builds

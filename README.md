# thelavanderia

Ansible playbooks for Raspberry Pi deployments.

## Flavors

- **production-control** - Remote production control for live/streamed events

## Usage

```bash
ansible-playbook -i inventory/hosts.yml playbooks/production-control.yml
```

## Roles

- `base` - Common packages and settings for all Pis
- `tailscale` - Tailscale VPN
- `vnc` - VNC remote desktop
- `companion` - Bitfocus Companion

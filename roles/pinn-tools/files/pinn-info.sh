#!/bin/bash
# Display PINN Tailscale info and optionally reboot to PINN

PINN_PARTITION="/dev/mmcblk0p1"
PINN_MOUNT="/tmp/pinn-mount"
PINN_IP_FILE="tailscale/pinn-tailscale-ip"

# Get Pi serial for hostname
PI_SERIAL=$(cat /proc/cpuinfo | grep Serial | cut -d ' ' -f 2 | tail -c 9)
PINN_HOSTNAME="pinn-${PI_SERIAL}"

echo "============================================"
echo "        PINN Recovery Information"
echo "============================================"
echo ""
echo "PINN Hostname: $PINN_HOSTNAME"
echo ""

# Try to mount PINN partition and read saved IP
mkdir -p "$PINN_MOUNT" 2>/dev/null
if sudo mount -o ro "$PINN_PARTITION" "$PINN_MOUNT" 2>/dev/null; then
    if [ -f "$PINN_MOUNT/$PINN_IP_FILE" ]; then
        PINN_IP=$(cat "$PINN_MOUNT/$PINN_IP_FILE")
        echo "PINN Tailscale IP: $PINN_IP"
        echo ""
        echo "To SSH to PINN (after reboot):"
        echo "  ssh root@$PINN_IP"
        echo ""
        echo "To VNC to PINN (after reboot):"
        echo "  vnc://$PINN_IP:5900"
    else
        echo "PINN Tailscale IP: Not yet configured"
        echo ""
        echo "After booting PINN, run the Tailscale init script:"
        echo "  /mnt/mmcblk0p1/tailscale/init.sh"
        echo ""
        echo "Look up '$PINN_HOSTNAME' in your Tailscale admin"
        echo "  https://login.tailscale.com/admin/machines"
    fi
    sudo umount "$PINN_MOUNT" 2>/dev/null
else
    echo "Could not read PINN partition."
    echo "Look up '$PINN_HOSTNAME' in Tailscale admin after boot."
fi

echo ""
echo "============================================"
echo ""

# If running interactively, offer to reboot
if [ -t 0 ]; then
    read -p "Reboot to PINN now? [y/N]: " choice
    case "$choice" in
        y|Y)
            /usr/local/bin/reboot-to-pinn
            ;;
        *)
            echo "Cancelled."
            ;;
    esac
fi

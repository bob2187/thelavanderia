#!/bin/sh
# Tailscale initialization script for PINN recovery environment
# This script runs on PINN boot to establish Tailscale connectivity

TAILSCALE_DIR="/mnt/tailscale"
TAILSCALE_STATE="/mnt/tailscale/state"
AUTH_KEY_FILE="/mnt/tailscale/authkey"

# Wait for network
echo "Waiting for network..."
for i in $(seq 1 30); do
    if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        echo "Network is up"
        break
    fi
    sleep 1
done

# Check if tailscale binary exists
if [ ! -f "$TAILSCALE_DIR/tailscaled" ]; then
    echo "Tailscale binary not found at $TAILSCALE_DIR/tailscaled"
    exit 1
fi

# Create state directory
mkdir -p "$TAILSCALE_STATE"

# Start tailscaled
echo "Starting tailscaled..."
"$TAILSCALE_DIR/tailscaled" --state="$TAILSCALE_STATE/tailscaled.state" --socket="$TAILSCALE_STATE/tailscaled.sock" &

# Wait for tailscaled to be ready
sleep 3

# Read auth key if exists
if [ -f "$AUTH_KEY_FILE" ]; then
    AUTH_KEY=$(cat "$AUTH_KEY_FILE")
    echo "Authenticating with Tailscale..."
    "$TAILSCALE_DIR/tailscale" --socket="$TAILSCALE_STATE/tailscaled.sock" up --authkey="$AUTH_KEY" --hostname="pinn-$(cat /proc/cpuinfo | grep Serial | cut -d ' ' -f 2 | tail -c 9)"
else
    echo "No auth key found. Run tailscale up manually."
fi

echo "Tailscale initialization complete"

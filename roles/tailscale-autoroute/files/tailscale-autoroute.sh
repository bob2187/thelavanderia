#!/bin/bash
# tailscale-autoroute.sh
# Automatically detect local subnets and update Tailscale advertised routes

set -euo pipefail

LOG_TAG="tailscale-autoroute"
STATE_FILE="/var/lib/tailscale-autoroute/last-routes"

log() {
    logger -t "$LOG_TAG" "$1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Get all local subnets excluding tailscale and loopback interfaces
get_local_subnets() {
    ip -4 addr show | \
        awk '
        /^[0-9]+:/ { iface=$2; gsub(/:/, "", iface) }
        /inet / && iface !~ /^(lo|tailscale)/ { print $2 }
        ' | \
        while read cidr; do
            # Skip loopback addresses
            if [[ "$cidr" == 127.* ]]; then
                continue
            fi
            # Convert IP/prefix to network/prefix (e.g., 192.168.1.50/24 -> 192.168.1.0/24)
            python3 -c "
import ipaddress
net = ipaddress.ip_network('$cidr', strict=False)
print(str(net))
"
        done | sort -u | tr '\n' ',' | sed 's/,$//'
}

# Main logic
main() {
    log "Checking for subnet changes..."

    # Ensure state directory exists
    mkdir -p "$(dirname "$STATE_FILE")"

    # Get current local subnets
    new_routes=$(get_local_subnets)

    if [ -z "$new_routes" ]; then
        log "No local subnets detected, skipping update"
        exit 0
    fi

    # Get last known routes
    old_routes=""
    if [ -f "$STATE_FILE" ]; then
        old_routes=$(cat "$STATE_FILE")
    fi

    # Compare and update if different
    if [ "$new_routes" != "$old_routes" ]; then
        log "Subnet change detected: '$old_routes' -> '$new_routes'"
        log "Updating Tailscale routes and enabling exit node..."

        if tailscale up --advertise-routes="$new_routes" --advertise-exit-node --reset; then
            echo "$new_routes" > "$STATE_FILE"
            log "Tailscale routes updated successfully: $new_routes"
        else
            log "ERROR: Failed to update Tailscale routes"
            exit 1
        fi
    else
        log "No changes detected, routes: $new_routes"
    fi
}

main "$@"

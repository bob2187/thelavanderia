#!/bin/bash
# tailscale-autoroute.sh
# Automatically detect local subnets and update Tailscale advertised routes
# Implements "first online wins" - stands down if another peer is already advertising

set -euo pipefail

LOG_TAG="tailscale-autoroute"
STATE_FILE="/var/lib/tailscale-autoroute/last-routes"
STATE_FILE_EXIT="/var/lib/tailscale-autoroute/last-exit-node"

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
        done | sort -u
}

# Get routes already advertised by OTHER online peers (not self)
# Returns comma-separated list of routes
get_peer_advertised_routes() {
    tailscale status --json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    my_id = data.get('Self', {}).get('ID', '')

    peer_routes = set()
    for peer_id, peer in data.get('Peer', {}).items():
        # Only consider online peers
        if not peer.get('Online', False):
            continue
        # Get their primary routes (approved and active subnet routes)
        for route in peer.get('PrimaryRoutes', []) or []:
            # Skip tailscale IPs and exit node routes
            if not route.startswith('100.') and route not in ('0.0.0.0/0', '::/0'):
                peer_routes.add(route)

    print(','.join(sorted(peer_routes)))
except Exception as e:
    print('')
" 2>/dev/null || echo ""
}

# Check if any other online peer is offering exit node
peer_has_exit_node() {
    tailscale status --json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    my_id = data.get('Self', {}).get('ID', '')

    for peer_id, peer in data.get('Peer', {}).items():
        # Only consider online peers
        if not peer.get('Online', False):
            continue
        # Check if peer offers exit node
        if peer.get('ExitNodeOption', False):
            print('yes')
            sys.exit(0)

    print('no')
except:
    print('no')
" 2>/dev/null || echo "no"
}

# Filter out routes that are already advertised by other peers
filter_conflicting_routes() {
    local my_routes="$1"
    local peer_routes="$2"

    if [ -z "$peer_routes" ]; then
        echo "$my_routes"
        return
    fi

    python3 -c "
my_routes = set('$my_routes'.split(',')) if '$my_routes' else set()
peer_routes = set('$peer_routes'.split(',')) if '$peer_routes' else set()

# Remove any routes already advertised by peers
available_routes = my_routes - peer_routes

# Log conflicts
conflicts = my_routes & peer_routes
for c in conflicts:
    print(f'CONFLICT: {c} already advertised by another peer, standing down', file=__import__('sys').stderr)

print(','.join(sorted(available_routes)))
"
}

# Main logic
main() {
    log "Checking for subnet changes..."

    # Ensure state directory exists
    mkdir -p "$(dirname "$STATE_FILE")"

    # Get current local subnets (newline separated)
    local_subnets=$(get_local_subnets)

    if [ -z "$local_subnets" ]; then
        log "No local subnets detected, skipping update"
        exit 0
    fi

    # Convert to comma-separated
    my_routes=$(echo "$local_subnets" | tr '\n' ',' | sed 's/,$//')

    # Get routes already advertised by other online peers
    peer_routes=$(get_peer_advertised_routes)
    if [ -n "$peer_routes" ]; then
        log "Routes already advertised by other peers: $peer_routes"
    fi

    # Filter out conflicting routes
    filtered_routes=$(filter_conflicting_routes "$my_routes" "$peer_routes" 2>&1)

    # Extract conflicts from stderr (lines starting with CONFLICT:)
    conflicts=$(echo "$filtered_routes" | grep "^CONFLICT:" || true)
    available_routes=$(echo "$filtered_routes" | grep -v "^CONFLICT:" || true)

    if [ -n "$conflicts" ]; then
        echo "$conflicts" | while read line; do
            log "$line"
        done
    fi

    # Check if another peer is already offering exit node
    exit_node_flag="--advertise-exit-node"
    if [ "$(peer_has_exit_node)" = "yes" ]; then
        log "Another peer is already offering exit node, standing down from exit node"
        exit_node_flag=""
    fi

    # Get last known state
    old_routes=""
    old_exit=""
    if [ -f "$STATE_FILE" ]; then
        old_routes=$(cat "$STATE_FILE")
    fi
    if [ -f "$STATE_FILE_EXIT" ]; then
        old_exit=$(cat "$STATE_FILE_EXIT")
    fi

    # Compare and update if different
    if [ "$available_routes" != "$old_routes" ] || [ "$exit_node_flag" != "$old_exit" ]; then
        if [ -n "$available_routes" ]; then
            log "Updating Tailscale routes: $available_routes"
            if [ -n "$exit_node_flag" ]; then
                log "Advertising as exit node"
            fi

            if tailscale up --advertise-routes="$available_routes" $exit_node_flag --reset; then
                echo "$available_routes" > "$STATE_FILE"
                echo "$exit_node_flag" > "$STATE_FILE_EXIT"
                log "Tailscale routes updated successfully"
            else
                log "ERROR: Failed to update Tailscale routes"
                exit 1
            fi
        else
            log "No routes to advertise (all conflicted with other peers)"
            # Still update tailscale to clear routes
            if tailscale up --advertise-routes="" $exit_node_flag --reset; then
                echo "" > "$STATE_FILE"
                echo "$exit_node_flag" > "$STATE_FILE_EXIT"
                log "Cleared all route advertisements"
            fi
        fi
    else
        log "No changes detected, routes: $available_routes"
    fi
}

main "$@"

#!/usr/bin/env python3
from flask import Flask, request, jsonify
import subprocess
import json

app = Flask(__name__)

# SAFETY: Only these interfaces can be modified
ALLOWED_INTERFACES = ['eth0']
PROTECTED_INTERFACES = ['wlan0', 'wlan1', 'tailscale0', 'lo']

# Global state for building configuration (pending)
state = {
    'mode': 'dhcp',
    'ip': [192, 168, 0, 100],
    'netmask': 24,
    'gateway': [192, 168, 0, 1],
    'dns': '8.8.8.8',
    'interface': 'eth0'
}

# Track last applied state to detect pending changes
last_applied = {
    'mode': None,
    'ip': None,
    'gateway': None
}

def run_cmd(cmd):
    """Execute shell command and return output"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout.strip()

def is_pending():
    """Check if there are unapplied changes"""
    if last_applied['mode'] is None:
        return True  # Never applied
    if last_applied['mode'] != state['mode']:
        return True
    if last_applied['ip'] != state['ip']:
        return True
    if last_applied['gateway'] != state['gateway']:
        return True
    return False

def get_actual_mode():
    """Detect actual network mode from NetworkManager"""
    active = run_cmd("nmcli -t -f NAME con show --active | grep -E '^Ethernet'")
    if 'DHCP' in active:
        return 'dhcp'
    elif 'Server' in active:
        return 'server'
    elif 'Static' in active:
        return 'static'
    return 'unknown'

def is_interface_safe(interface):
    """Check if interface is safe to modify"""
    return interface in ALLOWED_INTERFACES and interface not in PROTECTED_INTERFACES

@app.route('/status')
def get_status():
    """Get current network status"""
    eth0_ip = run_cmd("ip -4 addr show eth0 | grep inet | awk '{print $2}'")
    wlan_ip = run_cmd("ip -4 addr show wlan0 2>/dev/null | grep inet | awk '{print $2}'")
    tailscale_ip = run_cmd("ip -4 addr show tailscale0 2>/dev/null | grep inet | awk '{print $2}'")
    active_con = run_cmd("nmcli -t -f NAME,DEVICE con show --active")

    return jsonify({
        'eth0_ip': eth0_ip,
        'wlan0_ip': wlan_ip,
        'tailscale_ip': tailscale_ip,
        'active_connections': active_con,
        'configured': state,
        'safety': {
            'allowed_interfaces': ALLOWED_INTERFACES,
            'protected_interfaces': PROTECTED_INTERFACES
        }
    })

@app.route('/display')
def display():
    """Return simple text for display"""
    ip_str = '.'.join(map(str, state['ip']))
    gw_str = '.'.join(map(str, state['gateway']))
    eth0_ip = run_cmd("ip -4 addr show eth0 | grep inet | awk '{print $2}'")
    return f"Mode: {state['mode']}\nTarget: {ip_str}/{state['netmask']}\nGW: {gw_str}\neth0 now: {eth0_ip}", 200, {'Content-Type': 'text/plain'}

@app.route('/mode/<mode>')
def set_mode(mode):
    """Set network mode: dhcp, static, or server"""
    if mode in ['dhcp', 'static', 'server']:
        state['mode'] = mode
        return jsonify({'status': 'ok', 'mode': mode})
    return jsonify({'status': 'error', 'message': 'Invalid mode'}), 400

@app.route('/ip/<int:octet>/<action>')
def modify_ip(octet, action):
    """Increment/decrement IP octet (0-3) or set value"""
    if octet > 3:
        return jsonify({'status': 'error'}), 400

    if action == 'up':
        state['ip'][octet] = min(255, state['ip'][octet] + 1)
    elif action == 'down':
        state['ip'][octet] = max(0, state['ip'][octet] - 1)
    elif action == 'reset':
        defaults = {'0': 192, '1': 168, '2': 0, '3': 100}
        state['ip'][octet] = defaults.get(str(octet), 0)
    else:
        try:
            state['ip'][octet] = int(action)
        except:
            return jsonify({'status': 'error'}), 400

    return jsonify({'status': 'ok', 'ip': '.'.join(map(str, state['ip']))})

@app.route('/gateway/<int:octet>/<action>')
def modify_gateway(octet, action):
    """Modify gateway IP"""
    if octet > 3:
        return jsonify({'status': 'error'}), 400

    if action == 'up':
        state['gateway'][octet] = min(255, state['gateway'][octet] + 1)
    elif action == 'down':
        state['gateway'][octet] = max(0, state['gateway'][octet] - 1)
    else:
        try:
            state['gateway'][octet] = int(action)
        except:
            return jsonify({'status': 'error'}), 400

    return jsonify({'status': 'ok', 'gateway': '.'.join(map(str, state['gateway']))})

@app.route('/preset/<name>')
def load_preset(name):
    """Load common IP presets"""
    presets = {
        '192.168.0': {'ip': [192, 168, 0, 100], 'gateway': [192, 168, 0, 1]},
        '192.168.1': {'ip': [192, 168, 1, 100], 'gateway': [192, 168, 1, 1]},
        '10.0.0': {'ip': [10, 0, 0, 100], 'gateway': [10, 0, 0, 1]},
        '10.10.10': {'ip': [10, 10, 10, 100], 'gateway': [10, 10, 10, 1]},
        '172.16.0': {'ip': [172, 16, 0, 100], 'gateway': [172, 16, 0, 1]},
    }

    if name in presets:
        state['ip'] = presets[name]['ip']
        state['gateway'] = presets[name]['gateway']
        return jsonify({'status': 'ok', 'preset': name, 'ip': '.'.join(map(str, state['ip']))})

    return jsonify({'status': 'error', 'message': 'Unknown preset'}), 400

def has_backup_connection():
    """Check if WiFi or Tailscale is connected as backup"""
    wlan_ip = run_cmd("ip -4 addr show wlan0 2>/dev/null | grep inet | awk '{print $2}'")
    tailscale_ip = run_cmd("ip -4 addr show tailscale0 2>/dev/null | grep inet | awk '{print $2}'")
    return bool(wlan_ip) or bool(tailscale_ip)

@app.route('/apply')
@app.route('/apply/force')
def apply_config():
    """Apply the configured network settings - ONLY to eth0"""
    force_mode = request.path.endswith('/force')

    # SAFETY CHECK: Only modify allowed interfaces
    if not is_interface_safe(state['interface']):
        return jsonify({
            'status': 'error',
            'message': f"Interface {state['interface']} is not allowed. Only {ALLOWED_INTERFACES} can be modified."
        }), 403

    # SAFETY CHECK: Require backup connection (skip if force mode)
    if not force_mode and not has_backup_connection():
        return jsonify({
            'status': 'error',
            'message': 'No backup connection! WiFi or Tailscale must be connected. Use /apply/force to override.'
        }), 403

    ip_str = '.'.join(map(str, state['ip']))
    gw_str = '.'.join(map(str, state['gateway']))
    iface = state['interface']  # Always eth0

    try:
        # First, ensure we don't affect other interfaces
        # Only modify connections bound to eth0

        # HIGH METRIC (1000) ensures WiFi stays as default route
        # WiFi typically has metric ~600, so eth0 won't take over routing

        if state['mode'] == 'dhcp':
            # DHCP mode - only for eth0
            profile_name = 'Ethernet-DHCP'
            run_cmd(f"nmcli con delete '{profile_name}' 2>/dev/null || true")
            cmd = f"nmcli con add type ethernet ifname {iface} con-name '{profile_name}' ipv4.method auto ipv4.route-metric 1000 ipv6.method disabled"
            run_cmd(cmd)
            cmd = f"nmcli con up '{profile_name}'"

        elif state['mode'] == 'server':
            # DHCP Server mode - only for eth0 (no gateway needed for shared mode)
            profile_name = f"Ethernet-Server-{ip_str.replace('.', '-')}"
            run_cmd(f"nmcli con delete '{profile_name}' 2>/dev/null || true")
            cmd = f"nmcli con add type ethernet ifname {iface} con-name '{profile_name}' ipv4.method shared ipv4.addresses {ip_str}/{state['netmask']} ipv4.route-metric 1000 ipv6.method disabled"
            run_cmd(cmd)
            cmd = f"nmcli con up '{profile_name}'"

        elif state['mode'] == 'static':
            # Static IP mode - only for eth0, high metric keeps WiFi as default route
            profile_name = f"Ethernet-Static-{ip_str.replace('.', '-')}"
            run_cmd(f"nmcli con delete '{profile_name}' 2>/dev/null || true")
            cmd = f"nmcli con add type ethernet ifname {iface} con-name '{profile_name}' ipv4.method manual ipv4.addresses {ip_str}/{state['netmask']} ipv4.gateway {gw_str} ipv4.dns '{state['dns']}' ipv4.route-metric 1000 ipv6.method disabled"
            run_cmd(cmd)
            cmd = f"nmcli con up '{profile_name}'"

        result = run_cmd(cmd)

        # Track what we applied
        last_applied['mode'] = state['mode']
        last_applied['ip'] = state['ip'].copy()
        last_applied['gateway'] = state['gateway'].copy()

        # Get new IP
        import time
        time.sleep(2)
        new_ip = run_cmd(f"ip -4 addr show {iface} | grep inet | awk '{{print $2}}'")

        # Verify WiFi and Tailscale are still up
        wlan_status = run_cmd("nmcli -t -f STATE dev show wlan0 2>/dev/null | grep -i connected || echo 'not connected'")
        tailscale_ip = run_cmd("ip -4 addr show tailscale0 2>/dev/null | grep inet | awk '{print $2}' || echo 'none'")

        return jsonify({
            'status': 'ok',
            'mode': state['mode'],
            'interface': iface,
            'configured_ip': ip_str,
            'actual_ip': new_ip,
            'wlan_status': wlan_status,
            'tailscale_ip': tailscale_ip,
            'result': result
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/recovery')
def recovery():
    """Emergency recovery - restore DHCP on eth0"""
    try:
        run_cmd("nmcli con delete 'Ethernet-DHCP' 2>/dev/null || true")
        run_cmd("nmcli con delete 'Ethernet-Static-*' 2>/dev/null || true")
        run_cmd("nmcli con delete 'Ethernet-Server-*' 2>/dev/null || true")
        run_cmd("nmcli con add type ethernet ifname eth0 con-name 'Ethernet-DHCP' ipv4.method auto")
        run_cmd("nmcli con up 'Ethernet-DHCP'")

        state['mode'] = 'dhcp'

        return jsonify({'status': 'ok', 'message': 'Restored DHCP on eth0'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# =============================================================================
# STATE ENDPOINTS - For Companion button feedback
# =============================================================================

@app.route('/state')
def get_state():
    """Get full state for Companion - pending config and actual status"""
    ip_str = '.'.join(map(str, state['ip']))
    gw_str = '.'.join(map(str, state['gateway']))
    eth0_ip = run_cmd("ip -4 addr show eth0 | grep inet | awk '{print $2}'").split('/')[0]
    actual_mode = get_actual_mode()

    return jsonify({
        'pending': {
            'mode': state['mode'],
            'ip': ip_str,
            'gateway': gw_str
        },
        'actual': {
            'mode': actual_mode,
            'ip': eth0_ip
        },
        'has_changes': is_pending()
    })

@app.route('/state/mode')
def get_state_mode():
    """Get mode state for Companion mode buttons"""
    actual_mode = get_actual_mode()
    return jsonify({
        'pending': state['mode'],
        'actual': actual_mode,
        'has_changes': state['mode'] != actual_mode or is_pending()
    })

@app.route('/state/mode/<mode>')
def get_mode_button_state(mode):
    """Get state for a specific mode button (dhcp, static, server)"""
    actual_mode = get_actual_mode()
    is_selected = (state['mode'] == mode)
    is_active = (actual_mode == mode)
    pending = is_selected and not is_active

    return jsonify({
        'selected': is_selected,    # This mode is selected in pending config
        'active': is_active,        # This mode is actually running
        'pending': pending,         # Selected but not yet applied
        'color': 'green' if is_active else ('yellow' if is_selected else 'default')
    })

@app.route('/state/ip')
def get_state_ip():
    """Get pending IP address as string"""
    ip_str = '.'.join(map(str, state['ip']))
    eth0_ip = run_cmd("ip -4 addr show eth0 | grep inet | awk '{print $2}'").split('/')[0]
    return jsonify({
        'pending': ip_str,
        'actual': eth0_ip,
        'has_changes': ip_str != eth0_ip
    })

@app.route('/state/ip/<int:octet>')
def get_state_ip_octet(octet):
    """Get single IP octet for display button"""
    if octet > 3:
        return jsonify({'status': 'error'}), 400
    return jsonify({
        'value': state['ip'][octet],
        'text': str(state['ip'][octet])
    })

@app.route('/state/gateway')
def get_state_gateway():
    """Get pending gateway as string"""
    gw_str = '.'.join(map(str, state['gateway']))
    return jsonify({
        'pending': gw_str,
        'gateway': state['gateway']
    })

@app.route('/state/gateway/<int:octet>')
def get_state_gateway_octet(octet):
    """Get single gateway octet for display button"""
    if octet > 3:
        return jsonify({'status': 'error'}), 400
    return jsonify({
        'value': state['gateway'][octet],
        'text': str(state['gateway'][octet])
    })

@app.route('/state/pending')
def get_pending_status():
    """Check if there are unapplied changes - for Apply button feedback"""
    return jsonify({
        'has_changes': is_pending(),
        'color': 'yellow' if is_pending() else 'green'
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)

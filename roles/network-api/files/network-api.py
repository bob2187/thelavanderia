#!/usr/bin/env python3
from flask import Flask, request, jsonify
import subprocess
import json

app = Flask(__name__)

# Global state for building configuration
state = {
    'mode': 'dhcp',
    'ip': [192, 168, 0, 100],
    'netmask': 24,
    'gateway': [192, 168, 0, 1],
    'dns': '8.8.8.8',
    'interface': 'eth0'
}

def run_cmd(cmd):
    """Execute shell command and return output"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout.strip()

@app.route('/status')
def get_status():
    """Get current network status"""
    ip_info = run_cmd(f"ip -4 addr show {state['interface']} | grep inet | awk '{{print $2}}'")
    active_con = run_cmd(f"nmcli -t -f NAME con show --active | grep -v lo | head -1")

    return jsonify({
        'current_ip': ip_info,
        'active_connection': active_con,
        'configured': state
    })

@app.route('/display')
def display():
    """Return simple text for display"""
    ip_str = '.'.join(map(str, state['ip']))
    gw_str = '.'.join(map(str, state['gateway']))
    return f"Mode: {state['mode']}\nIP: {ip_str}/{state['netmask']}\nGW: {gw_str}", 200, {'Content-Type': 'text/plain'}

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

@app.route('/apply')
def apply_config():
    """Apply the configured network settings"""
    ip_str = '.'.join(map(str, state['ip']))
    gw_str = '.'.join(map(str, state['gateway']))

    try:
        if state['mode'] == 'dhcp':
            # Venue DHCP mode
            cmd = f"nmcli con up 'Venue-DHCP' 2>&1 || nmcli con add type ethernet ifname {state['interface']} con-name 'Venue-DHCP' ipv4.method auto ipv6.method disabled && nmcli con up 'Venue-DHCP'"

        elif state['mode'] == 'server':
            # Local DHCP Server mode
            profile_name = f"Local-{ip_str.replace('.', '-')}"
            cmd = f"nmcli con show '{profile_name}' >/dev/null 2>&1 && nmcli con up '{profile_name}' || (nmcli con add type ethernet ifname {state['interface']} con-name '{profile_name}' ipv4.method shared ipv4.addresses {ip_str}/{state['netmask']} ipv6.method disabled && nmcli con up '{profile_name}')"

        elif state['mode'] == 'static':
            # Static IP mode
            profile_name = f"Static-{ip_str.replace('.', '-')}"
            cmd = f"nmcli con show '{profile_name}' >/dev/null 2>&1 && nmcli con up '{profile_name}' || (nmcli con add type ethernet ifname {state['interface']} con-name '{profile_name}' ipv4.method manual ipv4.addresses {ip_str}/{state['netmask']} ipv4.gateway {gw_str} ipv4.dns '{state['dns']}' ipv6.method disabled && nmcli con up '{profile_name}')"

        result = run_cmd(cmd)

        # Get new IP
        import time
        time.sleep(2)
        new_ip = run_cmd(f"ip -4 addr show {state['interface']} | grep inet | awk '{{print $2}}'")

        return jsonify({
            'status': 'ok',
            'mode': state['mode'],
            'configured_ip': ip_str,
            'actual_ip': new_ip,
            'result': result
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)

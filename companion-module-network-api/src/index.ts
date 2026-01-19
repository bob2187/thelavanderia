import {
  InstanceBase,
  runEntrypoint,
  InstanceStatus,
  SomeCompanionConfigField,
  CompanionActionDefinitions,
  CompanionFeedbackDefinitions,
  CompanionVariableDefinition,
  CompanionPresetDefinitions,
  combineRgb,
} from '@companion-module/base'

interface NetworkApiConfig {
  host: string
  port: number
  pollInterval: number
}

interface ApiState {
  mode_actual: string
  mode_pending: string
  ip_pending: string
  ip_actual: string
  gateway_pending: string
  has_changes: boolean
  octets: string[]
  octets_actual: string[]
}

class NetworkApiModule extends InstanceBase<NetworkApiConfig> {
  private pollTimer: NodeJS.Timeout | null = null
  private config: NetworkApiConfig = { host: 'localhost', port: 5000, pollInterval: 1000 }
  private state: ApiState = {
    mode_actual: 'unknown',
    mode_pending: 'dhcp',
    ip_pending: '192.168.0.100',
    ip_actual: '',
    gateway_pending: '192.168.0.1',
    has_changes: true,
    octets: ['192', '168', '0', '100'],
    octets_actual: ['0', '0', '0', '0'],
  }

  async init(config: NetworkApiConfig): Promise<void> {
    this.config = config
    this.updateStatus(InstanceStatus.Connecting)

    this.setActionDefinitions(this.getActions())
    this.setFeedbackDefinitions(this.getFeedbacks())
    this.setVariableDefinitions(this.getVariables())
    this.setPresetDefinitions(this.getPresets())
    this.initVariables()

    // Start polling after init completes to avoid timeout
    if (config.host) {
      setTimeout(() => this.startPolling(), 1000)
    }

    this.updateStatus(InstanceStatus.Ok)
  }

  async configUpdated(config: NetworkApiConfig): Promise<void> {
    this.config = config
    this.stopPolling()
    if (config.host) {
      this.startPolling()
    }
  }

  async destroy(): Promise<void> {
    this.stopPolling()
  }

  getConfigFields(): SomeCompanionConfigField[] {
    return [
      { type: 'textinput', id: 'host', label: 'API Host', default: 'localhost', width: 8 },
      { type: 'number', id: 'port', label: 'API Port', default: 5000, width: 4, min: 1, max: 65535 },
      { type: 'number', id: 'pollInterval', label: 'Poll Interval (ms)', default: 1000, width: 4, min: 500, max: 10000 },
    ]
  }

  private getBaseUrl(): string {
    return `http://${this.config.host}:${this.config.port}`
  }

  private async apiGet(path: string): Promise<any> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(`${this.getBaseUrl()}${path}`, { signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (e: any) {
      clearTimeout(timeout)
      throw e
    }
  }

  private initVariables(): void {
    this.setVariableValues({
      mode_pending: this.state.mode_pending,
      mode_actual: this.state.mode_actual,
      ip_pending: this.state.ip_pending,
      ip_actual: this.state.ip_actual,
      gateway_pending: this.state.gateway_pending,
      has_changes: this.state.has_changes ? 'YES' : 'NO',
      octet_0: this.state.octets[0],
      octet_1: this.state.octets[1],
      octet_2: this.state.octets[2],
      octet_3: this.state.octets[3],
      actual_octet_0: this.state.octets_actual[0],
      actual_octet_1: this.state.octets_actual[1],
      actual_octet_2: this.state.octets_actual[2],
      actual_octet_3: this.state.octets_actual[3],
    })
  }

  private startPolling(): void {
    this.pollTimer = setInterval(() => this.pollState(), this.config.pollInterval || 1000)
    setTimeout(() => this.pollState(), 100)
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async pollState(): Promise<void> {
    try {
      const data = await this.apiGet('/state')
      this.state.mode_pending = data.pending?.mode || 'dhcp'
      this.state.mode_actual = data.actual?.mode || 'unknown'
      this.state.ip_pending = data.pending?.ip || ''
      this.state.ip_actual = data.actual?.ip || ''
      this.state.gateway_pending = data.pending?.gateway || ''
      this.state.has_changes = data.has_changes || false

      const parts = this.state.ip_pending.split('.')
      this.state.octets = [parts[0] || '0', parts[1] || '0', parts[2] || '0', parts[3] || '0']

      const actualParts = this.state.ip_actual.split('.')
      this.state.octets_actual = [actualParts[0] || '0', actualParts[1] || '0', actualParts[2] || '0', actualParts[3] || '0']

      this.updateStatus(InstanceStatus.Ok)
      this.setVariableValues({
        mode_pending: this.state.mode_pending,
        mode_actual: this.state.mode_actual,
        ip_pending: this.state.ip_pending,
        ip_actual: this.state.ip_actual,
        gateway_pending: this.state.gateway_pending,
        has_changes: this.state.has_changes ? 'YES' : 'NO',
        octet_0: this.state.octets[0],
        octet_1: this.state.octets[1],
        octet_2: this.state.octets[2],
        octet_3: this.state.octets[3],
        actual_octet_0: this.state.octets_actual[0],
        actual_octet_1: this.state.octets_actual[1],
        actual_octet_2: this.state.octets_actual[2],
        actual_octet_3: this.state.octets_actual[3],
      })
      this.checkFeedbacks('mode_active', 'mode_pending', 'has_changes')
    } catch (e) {
      this.updateStatus(InstanceStatus.ConnectionFailure)
    }
  }

  private getActions(): CompanionActionDefinitions {
    return {
      set_mode: {
        name: 'Set Mode',
        options: [
          { type: 'dropdown', id: 'mode', label: 'Mode', default: 'dhcp', choices: [
            { id: 'dhcp', label: 'DHCP' }, { id: 'static', label: 'Static' }, { id: 'server', label: 'Server' }
          ]}
        ],
        callback: async (action) => {
          try { await this.apiGet(`/mode/${action.options.mode}`); this.pollState() } catch (e) {}
        },
      },
      ip_up: {
        name: 'IP Octet Up',
        options: [
          { type: 'dropdown', id: 'octet', label: 'Octet', default: '3', choices: [
            { id: '0', label: '1st' }, { id: '1', label: '2nd' }, { id: '2', label: '3rd' }, { id: '3', label: '4th' }
          ]}
        ],
        callback: async (action) => {
          try { await this.apiGet(`/ip/${action.options.octet}/up`); this.pollState() } catch (e) {}
        },
      },
      ip_down: {
        name: 'IP Octet Down',
        options: [
          { type: 'dropdown', id: 'octet', label: 'Octet', default: '3', choices: [
            { id: '0', label: '1st' }, { id: '1', label: '2nd' }, { id: '2', label: '3rd' }, { id: '3', label: '4th' }
          ]}
        ],
        callback: async (action) => {
          try { await this.apiGet(`/ip/${action.options.octet}/down`); this.pollState() } catch (e) {}
        },
      },
      preset: {
        name: 'Load Preset',
        options: [
          { type: 'dropdown', id: 'preset', label: 'Preset', default: '192.168.0', choices: [
            { id: '192.168.0', label: '192.168.0.x' }, { id: '192.168.1', label: '192.168.1.x' },
            { id: '10.0.0', label: '10.0.0.x' }, { id: '10.10.10', label: '10.10.10.x' }, { id: '172.16.0', label: '172.16.0.x' }
          ]}
        ],
        callback: async (action) => {
          try { await this.apiGet(`/preset/${action.options.preset}`); this.pollState() } catch (e) {}
        },
      },
      apply: {
        name: 'Apply',
        options: [{ type: 'checkbox', id: 'force', label: 'Force', default: false }],
        callback: async (action) => {
          try { await this.apiGet(action.options.force ? '/apply/force' : '/apply'); this.pollState() } catch (e) {}
        },
      },
      recovery: {
        name: 'Recovery',
        options: [],
        callback: async () => {
          try { await this.apiGet('/recovery'); this.pollState() } catch (e) {}
        },
      },
    }
  }

  private getFeedbacks(): CompanionFeedbackDefinitions {
    return {
      mode_active: {
        type: 'boolean',
        name: 'Mode Active',
        description: 'True when mode is currently applied',
        defaultStyle: { bgcolor: combineRgb(0, 200, 0), color: combineRgb(0, 0, 0) },
        options: [
          { type: 'dropdown', id: 'mode', label: 'Mode', default: 'dhcp', choices: [
            { id: 'dhcp', label: 'DHCP' }, { id: 'static', label: 'Static' }, { id: 'server', label: 'Server' }
          ]}
        ],
        callback: (fb) => this.state.mode_actual === fb.options.mode,
      },
      mode_pending: {
        type: 'boolean',
        name: 'Mode Pending',
        description: 'True when mode is selected but not applied',
        defaultStyle: { bgcolor: combineRgb(200, 200, 0), color: combineRgb(0, 0, 0) },
        options: [
          { type: 'dropdown', id: 'mode', label: 'Mode', default: 'dhcp', choices: [
            { id: 'dhcp', label: 'DHCP' }, { id: 'static', label: 'Static' }, { id: 'server', label: 'Server' }
          ]}
        ],
        callback: (fb) => this.state.mode_pending === fb.options.mode && this.state.mode_actual !== fb.options.mode,
      },
      has_changes: {
        type: 'boolean',
        name: 'Has Changes',
        description: 'True when there are unapplied changes',
        defaultStyle: { bgcolor: combineRgb(200, 200, 0), color: combineRgb(0, 0, 0) },
        options: [],
        callback: () => this.state.has_changes,
      },
    }
  }

  private getVariables(): CompanionVariableDefinition[] {
    return [
      { variableId: 'mode_pending', name: 'Pending Mode' },
      { variableId: 'mode_actual', name: 'Actual Mode' },
      { variableId: 'ip_pending', name: 'Pending IP' },
      { variableId: 'ip_actual', name: 'Actual IP' },
      { variableId: 'gateway_pending', name: 'Pending Gateway' },
      { variableId: 'has_changes', name: 'Has Changes' },
      { variableId: 'octet_0', name: 'Pending Octet 1' },
      { variableId: 'octet_1', name: 'Pending Octet 2' },
      { variableId: 'octet_2', name: 'Pending Octet 3' },
      { variableId: 'octet_3', name: 'Pending Octet 4' },
      { variableId: 'actual_octet_0', name: 'Actual Octet 1' },
      { variableId: 'actual_octet_1', name: 'Actual Octet 2' },
      { variableId: 'actual_octet_2', name: 'Actual Octet 3' },
      { variableId: 'actual_octet_3', name: 'Actual Octet 4' },
    ]
  }

  private getPresets(): CompanionPresetDefinitions {
    return {
      mode_dhcp: {
        type: 'button', category: 'Modes', name: 'DHCP',
        style: { text: 'DHCP', size: '18', color: combineRgb(255,255,255), bgcolor: combineRgb(0,0,0) },
        steps: [{ down: [{ actionId: 'set_mode', options: { mode: 'dhcp' } }], up: [] }],
        feedbacks: [
          { feedbackId: 'mode_active', options: { mode: 'dhcp' }, style: { bgcolor: combineRgb(0,200,0) } },
          { feedbackId: 'mode_pending', options: { mode: 'dhcp' }, style: { bgcolor: combineRgb(200,200,0) } },
        ],
      },
      mode_static: {
        type: 'button', category: 'Modes', name: 'STATIC',
        style: { text: 'STATIC', size: '18', color: combineRgb(255,255,255), bgcolor: combineRgb(0,0,0) },
        steps: [{ down: [{ actionId: 'set_mode', options: { mode: 'static' } }], up: [] }],
        feedbacks: [
          { feedbackId: 'mode_active', options: { mode: 'static' }, style: { bgcolor: combineRgb(0,200,0) } },
          { feedbackId: 'mode_pending', options: { mode: 'static' }, style: { bgcolor: combineRgb(200,200,0) } },
        ],
      },
      mode_server: {
        type: 'button', category: 'Modes', name: 'SERVER',
        style: { text: 'SERVER', size: '18', color: combineRgb(255,255,255), bgcolor: combineRgb(0,0,0) },
        steps: [{ down: [{ actionId: 'set_mode', options: { mode: 'server' } }], up: [] }],
        feedbacks: [
          { feedbackId: 'mode_active', options: { mode: 'server' }, style: { bgcolor: combineRgb(0,200,0) } },
          { feedbackId: 'mode_pending', options: { mode: 'server' }, style: { bgcolor: combineRgb(200,200,0) } },
        ],
      },
      apply: {
        type: 'button', category: 'Control', name: 'APPLY',
        style: { text: 'APPLY', size: '18', color: combineRgb(255,255,255), bgcolor: combineRgb(0,0,100) },
        steps: [{ down: [{ actionId: 'apply', options: { force: false } }], up: [] }],
        feedbacks: [{ feedbackId: 'has_changes', options: {}, style: { bgcolor: combineRgb(200,200,0), text: 'APPLY!' } }],
      },
      recovery: {
        type: 'button', category: 'Control', name: 'RECOVERY',
        style: { text: 'RECOV', size: '18', color: combineRgb(255,255,255), bgcolor: combineRgb(150,0,0) },
        steps: [{ down: [{ actionId: 'recovery', options: {} }], up: [] }],
        feedbacks: [],
      },
      ip_display_0: { type: 'button', category: 'IP Pending', name: 'Pending Oct 1', style: { text: '$(netapi:octet_0)', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(40,40,40) }, steps: [{ down: [], up: [] }], feedbacks: [] },
      ip_display_1: { type: 'button', category: 'IP Pending', name: 'Pending Oct 2', style: { text: '$(netapi:octet_1)', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(40,40,40) }, steps: [{ down: [], up: [] }], feedbacks: [] },
      ip_display_2: { type: 'button', category: 'IP Pending', name: 'Pending Oct 3', style: { text: '$(netapi:octet_2)', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(40,40,40) }, steps: [{ down: [], up: [] }], feedbacks: [] },
      ip_display_3: { type: 'button', category: 'IP Pending', name: 'Pending Oct 4', style: { text: '$(netapi:octet_3)', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(40,40,40) }, steps: [{ down: [], up: [] }], feedbacks: [] },
      actual_ip_0: { type: 'button', category: 'IP Actual', name: 'Actual Oct 1', style: { text: '$(netapi:actual_octet_0)', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(0,60,0) }, steps: [{ down: [], up: [] }], feedbacks: [] },
      actual_ip_1: { type: 'button', category: 'IP Actual', name: 'Actual Oct 2', style: { text: '$(netapi:actual_octet_1)', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(0,60,0) }, steps: [{ down: [], up: [] }], feedbacks: [] },
      actual_ip_2: { type: 'button', category: 'IP Actual', name: 'Actual Oct 3', style: { text: '$(netapi:actual_octet_2)', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(0,60,0) }, steps: [{ down: [], up: [] }], feedbacks: [] },
      actual_ip_3: { type: 'button', category: 'IP Actual', name: 'Actual Oct 4', style: { text: '$(netapi:actual_octet_3)', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(0,60,0) }, steps: [{ down: [], up: [] }], feedbacks: [] },
      ip_up_0: { type: 'button', category: 'IP Adjust', name: 'Oct1+', style: { text: '+', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(0,80,0) }, steps: [{ down: [{ actionId: 'ip_up', options: { octet: '0' } }], up: [] }], feedbacks: [] },
      ip_up_1: { type: 'button', category: 'IP Adjust', name: 'Oct2+', style: { text: '+', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(0,80,0) }, steps: [{ down: [{ actionId: 'ip_up', options: { octet: '1' } }], up: [] }], feedbacks: [] },
      ip_up_2: { type: 'button', category: 'IP Adjust', name: 'Oct3+', style: { text: '+', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(0,80,0) }, steps: [{ down: [{ actionId: 'ip_up', options: { octet: '2' } }], up: [] }], feedbacks: [] },
      ip_up_3: { type: 'button', category: 'IP Adjust', name: 'Oct4+', style: { text: '+', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(0,80,0) }, steps: [{ down: [{ actionId: 'ip_up', options: { octet: '3' } }], up: [] }], feedbacks: [] },
      ip_down_0: { type: 'button', category: 'IP Adjust', name: 'Oct1-', style: { text: '-', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(80,0,0) }, steps: [{ down: [{ actionId: 'ip_down', options: { octet: '0' } }], up: [] }], feedbacks: [] },
      ip_down_1: { type: 'button', category: 'IP Adjust', name: 'Oct2-', style: { text: '-', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(80,0,0) }, steps: [{ down: [{ actionId: 'ip_down', options: { octet: '1' } }], up: [] }], feedbacks: [] },
      ip_down_2: { type: 'button', category: 'IP Adjust', name: 'Oct3-', style: { text: '-', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(80,0,0) }, steps: [{ down: [{ actionId: 'ip_down', options: { octet: '2' } }], up: [] }], feedbacks: [] },
      ip_down_3: { type: 'button', category: 'IP Adjust', name: 'Oct4-', style: { text: '-', size: '24', color: combineRgb(255,255,255), bgcolor: combineRgb(80,0,0) }, steps: [{ down: [{ actionId: 'ip_down', options: { octet: '3' } }], up: [] }], feedbacks: [] },
      preset_192_168_0: { type: 'button', category: 'Presets', name: '192.168.0', style: { text: '192.168.0', size: '14', color: combineRgb(255,255,255), bgcolor: combineRgb(50,50,50) }, steps: [{ down: [{ actionId: 'preset', options: { preset: '192.168.0' } }], up: [] }], feedbacks: [] },
      preset_10_10_10: { type: 'button', category: 'Presets', name: '10.10.10', style: { text: '10.10.10', size: '14', color: combineRgb(255,255,255), bgcolor: combineRgb(50,50,50) }, steps: [{ down: [{ actionId: 'preset', options: { preset: '10.10.10' } }], up: [] }], feedbacks: [] },
    }
  }
}

runEntrypoint(NetworkApiModule, [])

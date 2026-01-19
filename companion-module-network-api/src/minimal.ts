import {
  InstanceBase,
  runEntrypoint,
  InstanceStatus,
  SomeCompanionConfigField,
} from '@companion-module/base'

interface Config {
  host: string
}

class MinimalModule extends InstanceBase<Config> {
  async init(config: Config): Promise<void> {
    this.updateStatus(InstanceStatus.Ok)
  }

  async configUpdated(config: Config): Promise<void> {}

  async destroy(): Promise<void> {}

  getConfigFields(): SomeCompanionConfigField[] {
    return [
      { type: 'textinput', id: 'host', label: 'Host', default: 'localhost', width: 8 },
    ]
  }
}

runEntrypoint(MinimalModule, [])

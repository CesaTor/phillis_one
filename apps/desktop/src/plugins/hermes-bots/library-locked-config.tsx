import * as sdk from '@hermes/plugin-sdk'
import { Checkbox, host, Textarea } from '@hermes/plugin-sdk'
import type { ComponentProps } from 'react'

import { labeled } from './dialog-parts'
import { useBots } from './i18n'
import type { BotLibraryLock } from './library-lock'
import { LockedFields, ReadOnlyMcpList } from './library-lock'
import { ModelPicker } from './model-picker'
import type { AdvancedProfileConfig, CapabilityEntry } from './profile-config'
import { botBackendProfileScope, resolveBotConnectionRoute } from './routing'

// The advanced editor of a library-installed bot. Same sections as the open editor, but what the
// library overwrites on update is read-only: the SOUL, the MCP servers when `mcp_servers` is a managed
// key (the same for the model and the toolset pin), and no skill installs or removals. Skill
// on/off, toolset on/off and every setting the library does not own stay as they are. The full
// Capabilities surface is not offered here: its skill and MCP editing cannot be told apart per skill.

const { ConnectorsTab, ToolsetConfigPanel }: Partial<Pick<typeof sdk, 'ConnectorsTab' | 'ToolsetConfigPanel'>> = sdk

type EditorProps = ComponentProps<typeof AdvancedProfileConfig>

interface LockedBotConfigProps extends EditorProps {
  lock: BotLibraryLock
}

function ToggleList({ items, onToggle }: { items: CapabilityEntry[]; onToggle: (name: string, enabled: boolean) => void }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
      {items.map(item => (
        <label
          className="flex min-w-0 cursor-pointer items-center gap-1.5 py-0.5 text-xs text-(--ui-text-secondary)"
          key={item.name}
          title={item.description || item.name}
        >
          <Checkbox checked={!!item.enabled} onCheckedChange={value => onToggle(item.name, Boolean(value))} />
          <span className="truncate">{item.name}</span>
        </label>
      ))}
    </div>
  )
}

const toggled = (items: CapabilityEntry[], name: string, enabled: boolean) =>
  items.map(item => (item.name === name ? { ...item, enabled } : item))

export function LockedBotConfig({ bot, lock, setState, state }: LockedBotConfigProps) {
  const b = useBots()
  const route = resolveBotConnectionRoute(bot).route
  const scope = botBackendProfileScope(route, bot.name)
  const mcpManaged = lock.managed('mcp_servers')

  return (
    <div className="grid gap-4">
      <LockedFields locked={lock.managed('model')}>
        <ModelPicker
          bot={bot}
          onChange={patch => setState(prev => ({ ...prev, dirtyModel: true, ...patch }))}
          value={{ model: state.model, provider: state.provider }}
        />
      </LockedFields>
      {labeled(
        b.editor.skillsEnabled(state.skills.filter(s => s.enabled).length, state.skills.length),
        <div className="max-h-44 overflow-y-auto overscroll-contain rounded-md border border-(--ui-stroke-secondary) p-2">
          <ToggleList
            items={state.skills}
            onToggle={(name, enabled) =>
              setState(prev => ({ ...prev, dirtySkills: true, skills: toggled(prev.skills, name, enabled) }))
            }
          />
        </div>
      )}
      {labeled(
        b.editor.toolsetsEnabled(state.toolsets.filter(t => t.enabled).length, state.toolsets.length),
        <LockedFields locked={lock.managed('platform_toolsets')}>
          <div className="grid max-h-80 gap-1.5 overflow-y-auto overscroll-contain rounded-md border border-(--ui-stroke-secondary) p-2">
            {state.toolsets.map(toolset => (
              <div className="rounded-md border border-(--ui-stroke-secondary) p-2" key={toolset.name}>
                <label className="flex items-center gap-2 text-xs font-medium text-(--ui-text-secondary)">
                  <Checkbox
                    checked={!!toolset.enabled}
                    onCheckedChange={value =>
                      setState(prev => ({
                        ...prev,
                        dirtyToolsets: true,
                        toolsets: toggled(prev.toolsets, toolset.name, Boolean(value))
                      }))
                    }
                  />
                  <span>{toolset.name}</span>
                </label>
                {ToolsetConfigPanel ? (
                  <div className="mt-1.5 border-t border-(--ui-stroke-secondary) pt-1.5">
                    <ToolsetConfigPanel profile={scope} toolset={toolset.name} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </LockedFields>
      )}
      {labeled(
        b.editor.mcpServers,
        <div className="overflow-hidden rounded-md border border-(--ui-stroke-secondary)">
          {mcpManaged || !ConnectorsTab || typeof host.getGateway !== 'function' ? (
            <ReadOnlyMcpList servers={state.mcp} />
          ) : (
            <div className="max-h-90 min-h-55 overflow-y-auto overscroll-contain">
              <ConnectorsTab gateway={host.getGateway()} profile={scope} />
            </div>
          )}
        </div>
      )}
      {labeled(
        b.editor.editSoul,
        <Textarea
          aria-readonly
          className="min-h-28 font-mono text-xs leading-5"
          readOnly
          value={state.soul}
        />
      )}
    </div>
  )
}

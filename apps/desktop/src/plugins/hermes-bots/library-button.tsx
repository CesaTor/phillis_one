import { Button, Codicon, host, Tip } from '@hermes/plugin-sdk'

import { getPluginCtx } from './shared'

/** The Bots pane's door to the organization's bot library; nothing where the build has none. */
export function BotLibraryButton() {
  const library = getPluginCtx()?.botLibrary

  if (!library) {
    return null
  }

  return (
    <Tip label={library.label}>
      <Button
        aria-label={library.label}
        className="rounded-md text-(--ui-text-tertiary) hover:text-foreground"
        onClick={() => host.navigate(library.path)}
        size="icon-xs"
        variant="ghost"
      >
        <Codicon name="library" />
      </Button>
    </Tip>
  )
}

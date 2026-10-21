import { getProfileSoul, updateProfileSoul } from '@/hermes'
import { $profiles } from '@/store/profile'

import { defaultBotName } from '.'

// The backend seeds every home's SOUL.md (the bot's persona, identity slot #1
// of the system prompt) with upstream's default, which opens by naming the bot
// "Hermes Agent, built by Nous Research" — so out of the box a ReAgent bot
// introduces itself as Hermes. A distribution renames it here, through the
// same SOUL endpoint the persona editor uses, instead of patching upstream's
// default text: that file moves with every sync.
//
// Only a SOUL that is still upstream's untouched default is rewritten, and only
// its identity sentence: the rest of the persona stays upstream's. Any edit the
// user made — even one character — makes it theirs, and it is never touched.

const UPSTREAM_IDENTITY = 'You are Hermes Agent, built by Nous Research.'

/** hermes_cli/default_soul.py `DEFAULT_SOUL_MD`, verbatim (seed-soul.test.ts fails when they drift). */
export const UPSTREAM_DEFAULT_SOUL =
  UPSTREAM_IDENTITY +
  ' Be direct: match the length of your reply to the weight of the ask — a one-line question gets a one-line' +
  " answer, and finished work gets a short report of what changed, what's verified, and what's left, never a" +
  ' replay of the process. No filler ("Great question," "I\'d be happy to"), no restating the request back, no' +
  ' re-summarizing what you already said, no narrating tool calls the user can see. Plain claims over adjectives;' +
  " when unsure, say so plainly. Agree because it's right, not because the user said it. Depth is earned — give it" +
  ' when the user asks for detail, teaches, or the stakes demand it, not by default.'

const BUILDER = 'ReQurv'

// Plugin-era desktop builds appended a machine-written "Messaging other agents"
// roster to SOUL.md. The backend drops it at load time (tools/bot_mode_probe.py
// strip_legacy_protocol, mirrored here), so a default persona carrying it is
// still untouched — and the section itself is left as it is.
const LEGACY_PROTOCOL_HEADING = '## Messaging other agents'
const LEGACY_PROTOCOL = /\n*## Messaging other agents[ \t]*\n[\s\S]*?(?=\n## |$)/

function isUpstreamDefault(soul: string): boolean {
  const text = soul.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '')
  const persona = text.includes(LEGACY_PROTOCOL_HEADING) ? text.replace(LEGACY_PROTOCOL, '\n') : text

  return persona.trim() === UPSTREAM_DEFAULT_SOUL
}

async function rewriteUntouchedSoul(): Promise<void> {
  const { content, exists } = await getProfileSoul('default')

  if (exists && isUpstreamDefault(content)) {
    await updateProfileSoul(
      'default',
      content.replace(UPSTREAM_IDENTITY, `You are ${defaultBotName()}, built by ${BUILDER}.`)
    )
  }
}

let state: 'done' | 'idle' | 'running' = 'idle'

/** Waits for the profile list (the backend is up and owns a `default` home), then checks once per boot. */
export function seedDefaultSoul(): void {
  $profiles.subscribe(profiles => {
    if (state !== 'idle' || !profiles.some(profile => profile.is_default)) {
      return
    }

    state = 'running'
    void rewriteUntouchedSoul()
      .then(() => {
        state = 'done'
      })
      .catch(error => {
        // Let the next profile refresh retry: a backend mid-restart is the usual cause.
        state = 'idle'
        console.warn('[distribution] could not seed the default bot persona', error)
      })
  })
}

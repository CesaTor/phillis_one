import { notifyError } from '@/store/notifications'

// The backend answers a refusal with a plain sentence in `detail`; the desktop bridge wraps it as
// `Error invoking remote method 'hermes:api': Error: 400: {"detail":"…"}`. The library UI shows the
// sentence, never the wrapper.

const IPC_WRAPPER = /^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/
const STATUS_PREFIX = /^\d{3}:\s*/

function detailOf(body: string): null | string {
  try {
    const parsed = JSON.parse(body) as unknown
    const detail = parsed && typeof parsed === 'object' ? (parsed as { detail?: unknown }).detail : null

    return typeof detail === 'string' && detail.trim() ? detail.trim() : null
  } catch {
    return null
  }
}

/** The sentence a person should read for a failed library call. */
export function plainError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const body = raw.replace(IPC_WRAPPER, '').replace(STATUS_PREFIX, '').trim()

  return detailOf(body) ?? body
}

/** `notifyError` with the backend's sentence instead of the bridge's wrapper. */
export function notifyLibraryError(error: unknown, title: string): void {
  const message = plainError(error)

  // An untouched message keeps the original error, so timeouts and the like still classify.
  notifyError(error instanceof Error && error.message === message ? error : new Error(message), title)
}

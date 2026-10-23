import { beforeEach, describe, expect, it, vi } from 'vitest'

const notifyError = vi.fn()

vi.mock('@/store/notifications', () => ({ notifyError }))

beforeEach(() => notifyError.mockReset())

const RAW =
  'Error invoking remote method \'hermes:api\': Error: 400: {"detail":"Could not read the library folder: it has no bots."}'

describe('plainError', () => {
  it('extracts the backend sentence from the bridge error', async () => {
    const { plainError } = await import('./errors')

    expect(plainError(new Error(RAW))).toBe('Could not read the library folder: it has no bots.')
  })

  it('reads a bare JSON body and a plain message as they are', async () => {
    const { plainError } = await import('./errors')

    expect(plainError(new Error('{"detail":"A bot named x already exists"}'))).toBe('A bot named x already exists')
    expect(plainError(new Error('offline'))).toBe('offline')
    expect(plainError('offline')).toBe('offline')
  })

  it('drops the wrapper and status even when the body is not JSON', async () => {
    const { plainError } = await import('./errors')

    expect(plainError(new Error("Error invoking remote method 'hermes:api': Error: 502: Bad gateway"))).toBe('Bad gateway')
  })
})

describe('notifyLibraryError', () => {
  it('toasts the sentence, not the wrapper', async () => {
    const { notifyLibraryError } = await import('./errors')

    notifyLibraryError(new Error(RAW), 'Could not install x')

    expect(notifyError).toHaveBeenCalledTimes(1)
    expect((notifyError.mock.calls[0][0] as Error).message).toBe('Could not read the library folder: it has no bots.')
    expect(notifyError.mock.calls[0][1]).toBe('Could not install x')
  })

  it('passes an already plain error through untouched', async () => {
    const { notifyLibraryError } = await import('./errors')
    const error = new Error('offline')

    notifyLibraryError(error, 'Could not install x')

    expect(notifyError.mock.calls[0][0]).toBe(error)
  })
})

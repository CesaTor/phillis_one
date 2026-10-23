import { afterEach, describe, expect, it } from 'vitest'

import { installLibraryBot, listBotLibrary, rollbackLibraryBot, syncLibraryBots, updateLibraryBot } from './api'
import { mockApi } from './test-support'

afterEach(() => {
  Reflect.deleteProperty(window, 'hermesDesktop')
})

describe('the bot-library client', () => {
  it('lists a source, encoded into the query', async () => {
    const api = mockApi(() => ({ entries: [], source: 'x' }))

    await listBotLibrary('/Drive/Reparti/Vendite/Biblioteca agenti')

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/bot-library?source=%2FDrive%2FReparti%2FVendite%2FBiblioteca%20agenti'
      })
    )
  })

  it('installs by source and optional name', async () => {
    const api = mockApi(() => ({ profile: 'sales', version: '1.0' }))

    await expect(installLibraryBot('/lib', 'sales')).resolves.toEqual({ profile: 'sales', version: '1.0' })
    await installLibraryBot('https://github.com/ReQurv/reagent-bots')

    expect(api).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ body: { name: 'sales', source: '/lib' }, method: 'POST', path: '/api/bot-library/install' })
    )
    expect(api).toHaveBeenNthCalledWith(2, expect.objectContaining({ body: { source: 'https://github.com/ReQurv/reagent-bots' } }))
  })

  it('updates, syncs and rolls back without scoping the call to a profile', async () => {
    const api = mockApi(() => ({ results: [] }))

    await updateLibraryBot('sales')
    await syncLibraryBots()
    await rollbackLibraryBot('sales')

    expect(api.mock.calls.map(([request]) => [request.method, request.path, request.body])).toEqual([
      ['POST', '/api/bot-library/update', { profile: 'sales' }],
      ['POST', '/api/bot-library/sync', undefined],
      ['POST', '/api/bot-library/rollback', { profile: 'sales' }]
    ])
    expect(api.mock.calls.every(([request]) => !('profile' in request))).toBe(true)
  })
})

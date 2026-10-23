import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const readDesktopDir = vi.fn()

vi.mock('@/lib/desktop-fs', () => ({ readDesktopDir }))

const dir = (name: string) => ({ isDirectory: true, name, path: `/x/${name}` })
const file = (name: string) => ({ isDirectory: false, name, path: `/x/${name}` })

beforeEach(() => {
  vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')
})

afterEach(() => {
  vi.unstubAllEnvs()
  readDesktopDir.mockReset()
})

describe('the library folder convention', () => {
  it('lists departments as the folders under <root>/Reparti, sorted, files and dot-folders aside', async () => {
    const { listDepartments } = await import('./folders')

    readDesktopDir.mockResolvedValue({ entries: [dir('Vendite'), file('notes.txt'), dir('.sync'), dir('HR')] })

    await expect(listDepartments('/Drive/Org/')).resolves.toEqual(['HR', 'Vendite'])
    expect(readDesktopDir).toHaveBeenCalledWith('/Drive/Org/Reparti')
  })

  it('rejects when the departments folder cannot be read', async () => {
    const { listDepartments } = await import('./folders')

    readDesktopDir.mockResolvedValue({ entries: [], error: 'ENOENT' })

    await expect(listDepartments('/Drive/Org')).rejects.toThrow('ENOENT')
  })

  it('points a department at <root>/Reparti/<Department>/Biblioteca agenti, with the root’s separators', async () => {
    const { departmentSource } = await import('./folders')

    expect(departmentSource('/Drive/Org', 'Vendite')?.location).toBe('/Drive/Org/Reparti/Vendite/Biblioteca agenti')
    expect(departmentSource('C:\\Drive\\Org\\', 'Vendite')?.location).toBe(
      'C:\\Drive\\Org\\Reparti\\Vendite\\Biblioteca agenti'
    )
  })

  it('offers the department library and the base catalog; the base catalog alone without a folder', async () => {
    const { librarySources } = await import('./folders')

    expect(librarySources('/Drive/Org', 'Vendite').map(source => [source.label, source.department])).toEqual([
      ['Vendite', 'Vendite'],
      ['Standard bots', null]
    ])
    expect(librarySources(null, null).map(source => source.location)).toEqual(['https://github.com/ReQurv/reagent-bots'])
  })

  it('has no library at all outside ReAgent', async () => {
    vi.stubEnv('HERMES_DISTRIBUTION', '')

    const { librarySources, listDepartments } = await import('./folders')

    expect(librarySources('/Drive/Org', 'Vendite')).toEqual([])
    await expect(listDepartments('/Drive/Org')).resolves.toEqual([])
  })
})

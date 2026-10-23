import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $botDepartment, $department, $departmentHiddenBots, recordBotDepartment, setDepartment } from './store'

beforeEach(() => {
  $botDepartment.set({})
  $department.set(null)
})

afterEach(() => {
  window.localStorage.clear()
})

describe('which bots a department switch hides', () => {
  it('hides the bots installed for another department, not unmapped ones', () => {
    recordBotDepartment('sales', 'Sales')
    recordBotDepartment('hr-helper', 'HR')
    setDepartment('HR')

    expect([...$departmentHiddenBots.get()]).toEqual(['sales'])
    // `default` (the ReQurv bot), a user-made bot and base-catalog bots have no entry: never hidden.
    expect($departmentHiddenBots.get().has('default')).toBe(false)
    expect($departmentHiddenBots.get().has('my-bot')).toBe(false)
  })

  it('follows the department: switching back brings the bots back, and nothing is hidden before a pick', () => {
    recordBotDepartment('sales', 'Sales')

    expect($departmentHiddenBots.get().size).toBe(0)

    setDepartment('HR')
    expect($departmentHiddenBots.get().has('sales')).toBe(true)

    setDepartment('Sales')
    expect($departmentHiddenBots.get().has('sales')).toBe(false)
  })

  it('remembers the choices across a restart', async () => {
    recordBotDepartment('sales', 'Sales')
    setDepartment('Sales')

    vi.resetModules()

    const fresh = await import('./store')

    expect(fresh.$department.get()).toBe('Sales')
    expect(fresh.$botDepartment.get()).toEqual({ sales: 'Sales' })
  })
})

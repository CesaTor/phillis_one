import { describe, expect, it } from 'vitest'

import { isHiddenByDepartment } from './department-hidden'
import { deriveRosterRows } from './roster-pane-derivation'
import type { RosterRow } from './types'

const bot = (name: string, extra: Partial<RosterRow> = {}): RosterRow => ({ name, ...extra })

function listed(roster: RosterRow[], departmentHidden: ReadonlySet<string>): string[] {
  const { hiddenBots, visibleRoster } = deriveRosterRows({
    activeRosterKeys: new Set(),
    activityFilter: 'all',
    activityOf: () => 0,
    allMeta: {},
    departmentHidden,
    gatewayFilter: 'all',
    gatewayOptions: [],
    groupRooms: {},
    isPinned: () => false,
    query: '',
    roster,
    rowKindFilter: 'all'
  })

  return [...visibleRoster, ...hiddenBots].map(row => row.name)
}

describe('the Bots pane and another department’s bots', () => {
  const roster = [bot('default'), bot('sales'), bot('hr'), bot('mine')]

  it('leaves out the bots installed for another department and keeps every other bot', () => {
    expect(listed(roster, new Set(['sales']))).toEqual(['default', 'hr', 'mine'])
  })

  it('lists everything when nothing is hidden (upstream, or no department yet)', () => {
    expect(listed(roster, new Set())).toEqual(['default', 'sales', 'hr', 'mine'])
  })

  it('never hides a bot of the same name that lives on another gateway', () => {
    expect(isHiddenByDepartment(bot('sales', { remoteSource: true }), new Set(['sales']))).toBe(false)
    expect(isHiddenByDepartment(bot('sales'), new Set(['sales']))).toBe(true)
  })
})

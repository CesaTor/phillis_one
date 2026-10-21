import type * as HermesSdk from '@hermes/plugin-sdk'
import { host } from '@hermes/plugin-sdk'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { WritableAtom } from 'nanostores'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@hermes/plugin-sdk', async importOriginal => {
  const sdk = await importOriginal<typeof HermesSdk>()

  return {
    ...sdk,
    Button: (props: ComponentProps<'button'>) => <button {...props} />,
    host: {
      ...sdk.host,
      requestProfile: request,
      state: {
        ...sdk.host.state,
        connectionId: sdk.atom<string | null>('local'),
        profile: sdk.atom('default'),
        gateway: sdk.atom('connecting')
      }
    }
  }
})
vi.mock('./canonical-group-labels', async () => {
  const { CANONICAL_GROUP_LOCALES } = await import('./canonical-group-locales')

  return { useCanonicalGroupLabels: () => CANONICAL_GROUP_LOCALES.en }
})

import { CanonicalGroupList } from './canonical-group-registry'

const gateway = host.state.gateway as WritableAtom<string>
const NOT_CONNECTED = 'Hermes gateway is not connected'

// The window's socket as the gateway client behaves: a request before it opens
// rejects at once (JsonRpcGatewayClient.request), after it opens it is served.
request.mockImplementation(async (_route: unknown, method: string) => {
  if (gateway.get() !== 'open') {
    throw new Error(NOT_CONNECTED)
  }

  return method === 'groups.capabilities'
    ? { driver: true }
    : { rooms: [{ room_id: 'room-1', name: 'Standup', members: [] }], next_offset: null }
})

afterEach(() => {
  cleanup()
  gateway.set('connecting')
  request.mockClear()
})

it('loads the gateway groups once the boot socket opens, with no lingering not-connected error', async () => {
  render(<CanonicalGroupList onOpen={vi.fn()} />)

  await act(async () => {
    await Promise.resolve()
  })

  act(() => gateway.set('open'))

  await waitFor(() => expect(screen.getByText('Standup')).toBeTruthy())
  expect(screen.queryByRole('alert')).toBeNull()
})

it('asks the gateway again after a reconnect instead of keeping the dropped answer', async () => {
  gateway.set('open')
  render(<CanonicalGroupList onOpen={vi.fn()} />)
  await waitFor(() => expect(screen.getByText('Standup')).toBeTruthy())
  const asked = request.mock.calls.length

  act(() => gateway.set('connecting'))
  act(() => gateway.set('open'))

  await waitFor(() => expect(request.mock.calls.length).toBeGreaterThan(asked))
  await waitFor(() => expect(screen.getByText('Standup')).toBeTruthy())
  expect(screen.queryByRole('alert')).toBeNull()
})

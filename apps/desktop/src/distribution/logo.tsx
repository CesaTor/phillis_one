import type { ReactNode } from 'react'

import { useTheme } from '@/themes'

import { distributionLogo } from '.'

/** The distribution's full logo where upstream letters its wordmark; `fallback` (that lettering) otherwise. */
export function DistributionLogo({ fallback }: { fallback: ReactNode }) {
  const { renderedMode } = useTheme()
  const logo = distributionLogo(renderedMode === 'dark' ? 'dark' : 'light')

  if (!logo) {
    return fallback
  }

  return (
    <img
      alt="ReQurv Agent"
      className="mx-auto mb-4 block h-auto w-[min(80%,40rem)] select-none"
      draggable={false}
      src={`${import.meta.env.BASE_URL}${logo}`}
    />
  )
}

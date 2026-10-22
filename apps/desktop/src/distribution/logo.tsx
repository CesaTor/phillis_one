import type { ReactNode } from 'react'

import { distributionLogo } from '.'

/** The distribution's full logo where upstream letters its wordmark; `fallback` (that lettering) otherwise.
 *  One transparent artwork on every theme, shown exactly as designed. */
export function DistributionLogo({ fallback }: { fallback: ReactNode }) {
  const logo = distributionLogo()

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

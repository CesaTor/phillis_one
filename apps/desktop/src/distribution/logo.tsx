import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { useTheme } from '@/themes'

import { distributionLogo } from '.'

/** The distribution's full logo where upstream letters its wordmark; `fallback` (that lettering) otherwise.
 *  The artwork is white on a neon glow, made for dark backgrounds: on a light theme it keeps its
 *  own look on a dark plate rather than being recoloured. */
export function DistributionLogo({ fallback }: { fallback: ReactNode }) {
  const { renderedMode } = useTheme()
  const logo = distributionLogo()

  if (!logo) {
    return fallback
  }

  return (
    <div
      className={cn(
        'mx-auto mb-4 w-[min(80%,40rem)]',
        renderedMode === 'dark' ? '' : 'rounded-3xl bg-[#06050e] px-[4%] py-[3%]'
      )}
    >
      <img
        alt="ReQurv Agent"
        className="block h-auto w-full select-none"
        draggable={false}
        src={`${import.meta.env.BASE_URL}${logo}`}
      />
    </div>
  )
}

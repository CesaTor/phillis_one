import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import { copy } from './copy'
import type { DepartmentsState } from './folder-pick'

interface DepartmentListProps {
  onChange: (department: string) => void
  state: DepartmentsState
  value: null | string
}

/** One department, chosen from the folders under the library root. */
export function DepartmentList({ onChange, state, value }: DepartmentListProps): ReactElement | null {
  if (state.status === 'loading') {
    return <p className="text-sm text-muted-foreground">{copy.loading}</p>
  }

  if (state.status === 'error') {
    return <p className="text-sm text-destructive">{state.message}</p>
  }

  if (state.status !== 'ready') {
    return null
  }

  if (state.departments.length === 0) {
    return <p className="text-sm text-muted-foreground">{copy.noDepartments}</p>
  }

  return (
    <div aria-label={copy.department} className="grid gap-1.5" role="radiogroup">
      {state.departments.map(name => (
        <button
          aria-checked={value === name}
          className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
            value === name
              ? 'border-primary/50 bg-primary/10'
              : 'border-(--ui-stroke-secondary) hover:bg-(--chrome-action-hover)'
          )}
          key={name}
          onClick={() => onChange(name)}
          role="radio"
          type="button"
        >
          <span
            aria-hidden
            className={cn(
              'size-3 shrink-0 rounded-full border',
              value === name ? 'border-primary bg-primary' : 'border-(--ui-stroke-secondary)'
            )}
          />
          {name}
        </button>
      ))}
    </div>
  )
}

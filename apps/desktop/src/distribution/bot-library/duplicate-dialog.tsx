import { useStore } from '@nanostores/react'
import { type FormEvent, type ReactElement, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Loader2 } from '@/lib/icons'

import { copy } from './copy'
import { $duplicateRequest, closeDuplicate, defaultCopyName, runDuplicate } from './duplicate'

/** Mounted once beside the app: asks for the copy's name, then duplicates. */
export function LibraryDuplicateDialog(): ReactElement | null {
  const request = useStore($duplicateRequest)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(request ? defaultCopyName(request.label) : '')
    setBusy(false)
  }, [request])

  if (!request) {
    return null
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()

    if (busy || !name.trim()) {
      return
    }

    setBusy(true)
    void runDuplicate(request, name).then(done => !done && setBusy(false))
  }

  return (
    <Dialog onOpenChange={open => !open && !busy && closeDuplicate()} open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.duplicateTitle(request.label)}</DialogTitle>
          <DialogDescription>{copy.duplicateHint}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field htmlFor="library-duplicate-name" label={copy.duplicateNameLabel}>
            <Input autoFocus id="library-duplicate-name" onChange={event => setName(event.target.value)} value={name} />
          </Field>
          <DialogFooter>
            <Button disabled={busy} onClick={closeDuplicate} type="button" variant="ghost">
              {copy.cancel}
            </Button>
            <Button disabled={busy || !name.trim()} type="submit">
              {busy && <Loader2 className="animate-spin" />}
              {busy ? copy.duplicating : copy.duplicateConfirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

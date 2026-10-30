import { useState } from 'react'
import { BsBell } from 'react-icons/bs'

import { helpCallSound } from '../utils/push'

/**
 * In-app sound help: test notification + steps on this page.
 * Never opens Android intent:// (that was a blank screen).
 */
const SoundHelpButton = ({ className = 'btn btn-outline btn-small' }) => {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(null)

  const run = async (event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    setBusy(true)
    try {
      const next = await helpCallSound()
      setHelp(next)
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sound-help">
      <button type="button" className={className} disabled={busy} onClick={run}>
        <BsBell /> {busy ? '…' : 'Звук уведомлений'}
      </button>
      {open && help && (
        <div
          className="sound-help-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sound-help-title"
          onClick={() => setOpen(false)}
        >
          <div className="sound-help-panel" onClick={(event) => event.stopPropagation()}>
            <strong id="sound-help-title">{help.title}</strong>
            <ol>
              {help.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p>{help.hint}</p>
            <div className="sound-help-actions">
              <button type="button" className="btn btn-outline btn-small" onClick={run} disabled={busy}>
                Ещё раз проверить
              </button>
              <button type="button" className="btn btn-success btn-small" onClick={() => setOpen(false)}>
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SoundHelpButton

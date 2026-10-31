import { useEffect, useRef, useState } from 'react'
import { BsMagic, BsX } from 'react-icons/bs'

import { BACKGROUNDS, hasPhoto, setPhotoFromFile } from '../utils/backgrounds'
import { MASKS } from '../utils/masks'
import { REACTIONS } from './ReactionBurst'

/**
 * One ✨ button → sheet with masks, backgrounds and gesture reactions.
 * Keeps the control bar minimal.
 */
const EffectsPanel = ({ mask, onMask, background, onBackground, gestures, onGestures, disabled }) => {
  const [open, setOpen] = useState(false)
  const [photoReady, setPhotoReady] = useState(() => hasPhoto())
  const fileRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const pickBackground = (id) => {
    if (id === 'photo' && !photoReady) {
      fileRef.current?.click()
      return
    }
    onBackground(id)
  }

  const onFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      await setPhotoFromFile(file)
      setPhotoReady(true)
      onBackground('photo')
    } catch { /* ignore */ }
  }

  const active = mask !== 'none' || background !== 'none'

  return (
    <>
      <button
        type="button"
        className={`ctrl ${active ? 'ctrl-on' : ''}`}
        onClick={() => setOpen(true)}
        disabled={disabled}
        title="Эффекты"
        aria-label="Эффекты"
      >
        <BsMagic />
      </button>

      {open && (
        <div className="effects-overlay" onClick={() => setOpen(false)} role="presentation">
          <div className="effects-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Эффекты">
            <div className="effects-head">
              <strong>Эффекты</strong>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Закрыть"><BsX /></button>
            </div>

            <p className="effects-label">Маска</p>
            <div className="chip-row">
              {MASKS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chip ${mask === item.id ? 'is-active' : ''}`}
                  onClick={() => onMask(item.id)}
                >
                  <span className="chip-emoji">{item.emoji}</span>{item.name}
                </button>
              ))}
            </div>

            <p className="effects-label">Фон</p>
            <div className="chip-row">
              {BACKGROUNDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chip ${background === item.id ? 'is-active' : ''}`}
                  onClick={() => pickBackground(item.id)}
                  onDoubleClick={item.id === 'photo' ? () => fileRef.current?.click() : undefined}
                  title={item.id === 'photo' ? 'Двойной клик — выбрать другое фото' : undefined}
                >
                  <span className="chip-emoji">{item.emoji}</span>{item.name}
                </button>
              ))}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            </div>

            <p className="effects-label">Реакции жестами</p>
            <label className="effects-toggle">
              <input type="checkbox" checked={gestures} onChange={(event) => onGestures(event.target.checked)} />
              <span>Показать камере жест — все увидят анимацию</span>
            </label>
            <div className="gesture-legend">
              {Object.entries(REACTIONS).map(([id, item]) => (
                <span key={id}><b>{item.main}</b> {item.label}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default EffectsPanel

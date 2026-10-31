import { useMemo } from 'react'

export const REACTIONS = {
  thumbs: { main: '👍', bits: ['✨', '⭐', '🌟', '✨'], label: 'Класс' },
  palm: { main: '👋', bits: ['❤️', '💛', '💖', '🧡'], label: 'Привет' },
  fist: { main: '✊', bits: ['🔥', '🔥', '💥', '🔥'], label: 'Огонь' },
  rock: { main: '🤘', bits: ['⚡', '🔥', '🎸', '⚡'], label: 'Рок' }
}

export const REACTION_MS = 2400

/** Short emoji burst over a video tile. Parent unmounts it after REACTION_MS. */
const ReactionBurst = ({ kind, nonce }) => {
  const spec = REACTIONS[kind]
  const bits = useMemo(() => {
    const list = spec?.bits || ['✨']
    return Array.from({ length: 16 }, (_, i) => ({
      id: `${nonce}-${i}`,
      glyph: list[i % list.length],
      left: 6 + Math.random() * 88,
      delay: Math.random() * 0.7,
      dur: 1.3 + Math.random() * 0.9,
      size: 0.9 + Math.random() * 1.1,
      drift: (Math.random() - 0.5) * 60
    }))
  }, [nonce, spec])

  if (!spec) return null
  return (
    <div className={`reaction-burst reaction-${kind}`} aria-hidden>
      <span className="reaction-main">{spec.main}</span>
      {bits.map((bit) => (
        <span
          key={bit.id}
          className="reaction-bit"
          style={{
            left: `${bit.left}%`,
            animationDelay: `${bit.delay}s`,
            animationDuration: `${bit.dur}s`,
            fontSize: `${bit.size}rem`,
            '--drift': `${bit.drift}px`
          }}
        >
          {bit.glyph}
        </span>
      ))}
    </div>
  )
}

export default ReactionBurst

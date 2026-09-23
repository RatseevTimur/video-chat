import { useEffect, useRef, useState } from 'react'
import { BsCheck, BsCopy } from 'react-icons/bs'

const InCallChat = ({ messages, onSend, localId, title, hint }) => {
  const [text, setText] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const send = (event) => {
    event.preventDefault()
    const next = text.trim()
    if (!next) return
    onSend(next)
    setText('')
  }

  const copy = async (message) => {
    try {
      await navigator.clipboard.writeText(message.text)
      setCopiedId(message.id)
      setTimeout(() => setCopiedId(''), 1500)
    } catch {
      // ignore
    }
  }

  const copyAll = async () => {
    const blob = messages.map((item) => `${item.fromName || item.from}: ${item.text}`).join('\n')
    try {
      await navigator.clipboard.writeText(blob)
      setCopiedId('all')
      setTimeout(() => setCopiedId(''), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <aside className="in-call-chat">
      <div className="chat-head">
        <div>
          <h3>{title || 'Чат / Chat'}</h3>
          <p>{hint || 'Сообщения живут только пока активен звонок.'}</p>
        </div>
        <button type="button" className="btn btn-small" onClick={copyAll} disabled={!messages.length}>
          {copiedId === 'all' ? <BsCheck /> : <BsCopy />}
        </button>
      </div>

      <div className="chat-list" ref={listRef}>
        {!messages.length && <div className="chat-empty">Пока нет сообщений / No messages yet</div>}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-item ${message.from === localId ? 'mine' : ''}`}
          >
            <div className="chat-meta">
              <span>{message.from === localId ? 'Вы / You' : (message.fromName || message.from)}</span>
              <button type="button" onClick={() => copy(message)} title="Copy">
                {copiedId === message.id ? <BsCheck /> : <BsCopy />}
              </button>
            </div>
            <p>{message.text}</p>
          </div>
        ))}
      </div>

      <form className="chat-form" onSubmit={send}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={2000}
          placeholder="Сообщение / Message"
        />
        <button type="submit" className="btn btn-primary">OK</button>
      </form>
    </aside>
  )
}

export default InCallChat

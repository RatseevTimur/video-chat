import { useEffect, useMemo, useRef, useState } from 'react'
import { BsCameraVideo, BsPlus, BsSend } from 'react-icons/bs'
import { useNavigate, useParams } from 'react-router-dom'

import { api, clearSession, getSession } from '../utils/auth'
import { loadOrCreateKeys, openBox, sealForMembers } from '../utils/e2e'
import { createRingtone, notifyIncoming, requestNotifyPermission } from '../utils/ringtone'
import socket from '../utils/socket'
import IncomingCall from './IncomingCall'

const Messenger = () => {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const me = getSession()
  const [chats, setChats] = useState([])
  const [title, setTitle] = useState('Семья')
  const [emails, setEmails] = useState('')
  const [error, setError] = useState('')
  const [active, setActive] = useState(null)
  const [members, setMembers] = useState([])
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [incoming, setIncoming] = useState(null)
  const keysRef = useRef(null)
  const ringtoneRef = useRef(null)

  const currentId = chatId || active?.id

  const loadChats = async () => {
    const data = await api('/api/chats')
    setChats(data.chats || [])
  }

  const decryptList = async (raw, users) => {
    const keys = keysRef.current
    if (!keys) return []
    const byEmail = Object.fromEntries(users.map((user) => [user.email, user]))
    const next = []
    for (const item of raw) {
      const sender = byEmail[item.from]
      const plain = await openBox(item.boxes, me.email, sender?.publicJwk, keys.privateJwk)
      next.push({
        ...item,
        text: plain || 'Не удалось расшифровать / Cannot decrypt'
      })
    }
    return next
  }

  const openChat = async (id) => {
    const data = await api(`/api/chats/${id}`)
    setActive(data.chat)
    setMembers(data.users || [])
    setMessages(await decryptList(data.messages || [], data.users || []))
    navigate(`/chat/${id}`)
  }

  useEffect(() => {
    requestNotifyPermission()
    let cancelled = false
    ;(async () => {
      keysRef.current = await loadOrCreateKeys()
      await loadChats()
      if (chatId && !cancelled) await openChat(chatId)
    })().catch((err) => setError(err.message))

    const boot = () => {
      socket.emit('init')
      socket.emit('identify', { token: me.token })
    }
    if (socket.connected) boot()
    else socket.once('connect', boot)

    const onMail = async ({ message, users }) => {
      if (message?.chatId !== (chatId || active?.id)) return
      const decoded = await decryptList([message], users || members)
      setMessages((prev) => [...prev, ...decoded.filter((item) => !prev.some((row) => row.id === item.id))])
    }
    const onInvite = () => loadChats()
    const onRing = (payload) => {
      setIncoming(payload)
      ringtoneRef.current?.stop()
      ringtoneRef.current = createRingtone()
      ringtoneRef.current.start()
      notifyIncoming('Входящий звонок / Incoming call', payload.fromName || payload.from)
    }

    socket.on('mailMessage', onMail)
    socket.on('chatInvited', onInvite)
    socket.on('familyCall', onRing)

    return () => {
      cancelled = true
      socket.off('mailMessage', onMail)
      socket.off('chatInvited', onInvite)
      socket.off('familyCall', onRing)
      ringtoneRef.current?.stop()
    }
  }, [chatId])

  const create = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const data = await api('/api/chats', {
        method: 'POST',
        body: {
          name: title,
          emails: emails.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean)
        }
      })
      setEmails('')
      await loadChats()
      await openChat(data.chat.id)
    } catch (err) {
      setError(err.message)
    }
  }

  const send = async (event) => {
    event.preventDefault()
    const body = text.trim()
    if (!body || !active) return
    setText('')
    const keys = keysRef.current
    const boxes = await sealForMembers(members.filter((item) => !item.missing), keys.privateJwk, body)
    const data = await api(`/api/chats/${active.id}/messages`, {
      method: 'POST',
      body: { boxes }
    })
    socket.emit('mailMessage', { chatId: active.id, message: data.message })
    setMessages((prev) => [...prev, { ...data.message, text: body, from: me.email }])
  }

  const callAll = () => {
    if (!active) return
    socket.emit('startChatCall', { chatId: active.id, roomId: active.roomId })
    navigate(`/room/${active.roomId}?family=1`)
  }

  const people = useMemo(
    () => members.map((item) => item.name || item.email).join(', '),
    [members]
  )

  return (
    <div className="messenger">
      {incoming && (
        <IncomingCall
          fromName={incoming.fromName || incoming.from}
          onAccept={() => {
            ringtoneRef.current?.stop()
            const roomId = incoming.roomId
            setIncoming(null)
            navigate(`/room/${roomId}?family=1`)
          }}
          onReject={() => {
            ringtoneRef.current?.stop()
            setIncoming(null)
          }}
        />
      )}

      <aside className="inbox">
        <header>
          <div>
            <strong>{me.name}</strong>
            <p>{me.email}</p>
          </div>
          <button type="button" className="btn btn-small btn-outline" onClick={() => { clearSession(); window.location.href = '/' }}>
            Выход
          </button>
        </header>

        <form className="new-chat" onSubmit={create}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название чата / Chat name" />
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="Почты родственников / Relatives' emails"
            rows={3}
          />
          <button type="submit" className="btn btn-primary">
            <BsPlus /> Создать чат / New chat
          </button>
        </form>

        <div className="chat-nav">
          {chats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              className={chat.id === currentId ? 'active' : ''}
              onClick={() => openChat(chat.id)}
            >
              {chat.name}
              <span>{chat.members.length} чел.</span>
            </button>
          ))}
        </div>
        <a className="guest-link" href="/guest">Гостевая комната без почты / Guest room</a>
      </aside>

      <section className="thread">
        {active ? (
          <>
            <header>
              <div>
                <h2>{active.name}</h2>
                <p>{people}</p>
              </div>
              <button type="button" className="btn btn-success" onClick={callAll}>
                <BsCameraVideo /> Позвонить всем / Call all
              </button>
            </header>
            <div className="thread-list">
              {messages.map((message) => (
                <div key={message.id} className={`chat-item ${message.from === me.email ? 'mine' : ''}`}>
                  <div className="chat-meta">
                    <span>{message.from === me.email ? 'Вы / You' : message.from}</span>
                    <button type="button" onClick={() => navigator.clipboard.writeText(message.text)}>Copy</button>
                  </div>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
            <form className="chat-form" onSubmit={send}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Сообщение / Message" />
              <button type="submit" className="btn btn-primary"><BsSend /></button>
            </form>
          </>
        ) : (
          <div className="placeholder">Создайте семейный чат и добавьте почты родственников.</div>
        )}
        {error && <div className="error">{error}</div>}
      </section>
    </div>
  )
}

export default Messenger

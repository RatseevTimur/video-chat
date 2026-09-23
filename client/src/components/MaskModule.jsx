import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import MaskEngine from '../utils/MaskEngine'
import MaskPicker from './MaskPicker'

const MaskModule = () => {
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const streamRef = useRef(null)
  const [maskId, setMaskId] = useState('glasses')
  const [status, setStatus] = useState('Загрузка камеры… / Starting camera…')

  useEffect(() => {
    let cancelled = false
    const engine = new MaskEngine()
    engineRef.current = engine

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
          audio: false
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        setStatus('Загрузка детектора… / Loading detector…')
        await engine.init()
        await engine.setMask(maskId)
        engine.attach({ stream, canvas: canvasRef.current })
        setStatus('')
      } catch (error) {
        console.error(error)
        setStatus('Нет доступа к камере / Camera permission denied')
      }
    }

    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      engine.dispose()
    }
  }, [])

  return (
    <div className="mask-demo">
      <div className="meet-header">
        <Link to="/" className="btn btn-outline">Назад / Back</Link>
        <h1>Демо масок / Mask demo</h1>
      </div>
      {status && <div className="error">{status}</div>}
      <div className="mask-demo-stage">
        <canvas ref={canvasRef} className="local-canvas" />
      </div>
      <MaskPicker
        value={maskId}
        onChange={async (id) => {
          setMaskId(id)
          await engineRef.current?.setMask(id)
        }}
      />
    </div>
  )
}

export default MaskModule

'use client'

import { useEffect, useRef, useState } from 'react'
import type { HolisticLandmarker } from '@mediapipe/tasks-vision'
import { conectarModelo, predecirSena, type ModelState, type PrediccionLSP } from '@/lib/api'
import { CONTRACT, EXTRACTOR_SHA, packHands, type Capture } from '@/lib/recognition-contract'
import { EXTRACTOR_RUNTIME } from '@/lib/runtime-contract'
import { Button } from '@/components/ui/button'
import { requestCamera, cameraError } from '@/lib/camera'
import { AutomaticRecognizer } from '@/components/automatic-recognizer'
import { FingerTracker } from '@/components/finger-tracker'

type Phase = 'idle' | 'camera' | 'preparing' | 'capturing' | 'sending'

export function Recognizer({ onVerEnDiccionario }: { onVerEnDiccionario?: (glosa: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const detector = useRef<HolisticLandmarker | null>(null)
  const raf = useRef<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  const connectionAbort = useRef<AbortController | null>(null)
  const connectionGeneration = useRef(0)
  const generation = useRef(0)
  const running = useRef(false)
  const capture = useRef<Capture | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [model, setModel] = useState<ModelState | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [mode, setMode] = useState<'manual' | 'auto' | 'fingers'>('manual')
  const [connecting, setConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [message, setMessage] = useState('Activa la cámara para comprobar la imagen. Conecta el servidor cuando quieras reconocer una seña.')
  const [error, setError] = useState('')
  const [count, setCount] = useState(0)
  const [hands, setHands] = useState(0)
  const [result, setResult] = useState<PrediccionLSP | null>(null)

  const release = () => {
    generation.current++
    connectionGeneration.current++
    running.current = false
    abort.current?.abort()
    connectionAbort.current?.abort()
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    raf.current = null
    detector.current?.close()
    detector.current = null
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    capture.current = null
  }
  useEffect(() => () => release(), [])

  const stop = () => {
    release()
    if (video.current) video.current.srcObject = null
    setCameraOn(false); setPhase('idle'); setCount(0); setHands(0); setResult(null)
    setConnecting(false); setError(''); setConnectionError('')
    setMessage('Captura detenida. Puedes volver a activar la cámara.')
  }

  const connect = async () => {
    const token = ++connectionGeneration.current
    connectionAbort.current?.abort()
    const controller = new AbortController(); connectionAbort.current = controller
    setConnecting(true); setConnectionError(''); setModel(null)
    try {
      const state = await conectarModelo(controller.signal)
      if (token !== connectionGeneration.current) return
      if (!state.ready || state.contract !== CONTRACT || state.extractor_sha256 !== EXTRACTOR_SHA) throw new Error('La versión del servidor no es compatible con esta interfaz.')
      setModel(state)
    } catch (e) {
      if (token === connectionGeneration.current) setConnectionError(e instanceof Error ? e.message : 'No se pudo conectar.')
    } finally {
      if (token === connectionGeneration.current) setConnecting(false)
    }
  }

  const activate = async () => {
    const token = ++generation.current
    setPhase('camera'); setError('')
    setMessage('Esperando permiso de cámara. Revisa el aviso del navegador; puedes cancelar si no aparece.')
    try {
      const media = await requestCamera(navigator.mediaDevices, window.isSecureContext)
      if (token !== generation.current) { media.getTracks().forEach(t => t.stop()); return }
      stream.current = media
      if (!video.current) throw new Error('No se pudo preparar la vista de cámara.')
      video.current.srcObject = media
      await video.current.play()
      if (token !== generation.current) return
      setCameraOn(true); setMessage(mode === 'fingers' ? 'Cámara activa. Muestra las manos completas para ver sus puntos.' : 'Cámara activa. Conecta el servidor y elige captura manual o automática.')
      media.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (stream.current !== media) return
        stop()
        setError('La cámara se desconectó o se retiró el permiso. Comprueba la conexión y vuelve a activarla.')
      }, { once: true }))
    } catch (e) {
      if (token === generation.current) {
        stream.current?.getTracks().forEach(t => t.stop()); stream.current = null
        if (video.current) video.current.srcObject = null
        setCameraOn(false); setError(cameraError(e)); setMessage('No se pudo activar la cámara. Revisa el aviso y vuelve a intentarlo.')
      }
    } finally { if (token === generation.current) setPhase('idle') }
  }

  const finish = async () => {
    if (!running.current) return
    running.current = false
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    detector.current?.close(); detector.current = null
    const payload = capture.current; capture.current = null
    if (!payload || payload.landmarks.length < 3) {
      setPhase('idle'); setError('La captura fue demasiado breve. Realiza la seña completa.'); return
    }
    const token = generation.current
    const controller = new AbortController(); abort.current = controller
    setPhase('sending'); setMessage('Procesando la seña…')
    try {
      const prediction = await predecirSena(payload, controller.signal)
      if (token !== generation.current) return
      setResult(prediction); setMessage(prediction.mensaje)
    } catch (e) {
      if (token === generation.current) setError(e instanceof Error ? e.message : 'No se pudo procesar la captura.')
    } finally { if (token === generation.current) setPhase('idle') }
  }

  const start = async () => {
    if (!model?.ready || !video.current || !stream.current || phase !== 'idle') return
    const token = ++generation.current
    const controller = new AbortController(); abort.current = controller
    setPhase('preparing'); setError(''); setResult(null); setCount(0); setHands(0)
    setMessage('Preparando la captura… espera la indicación para realizar la seña.')
    try {
      const { createDetector } = await import('@/lib/holistic-extractor')
      const instance = await createDetector('/mediapipe', controller.signal)
      if (token !== generation.current) { instance.close(); return }
      detector.current = instance
      const element = video.current!
      capture.current = { ...{ extractor_runtime: EXTRACTOR_RUNTIME }, contract: CONTRACT, extractor_sha256: EXTRACTOR_SHA, landmarks: [], point_mask: [], timestamps_ms: [], width: element.videoWidth, height: element.videoHeight }
      running.current = true
      setPhase('capturing'); setMessage('Realiza una seña y pulsa «Terminar y reconocer». Máximo 6 segundos.')
      let origin: number | null = null
      let next = 0
      let previous = -1
      const captureStarted = performance.now()
      const loop = () => {
        if (!running.current || token !== generation.current) return
        try {
          if (performance.now() - captureStarted >= 8000) { void finish(); return }
          const timestamp = Math.round(element.currentTime * 1000)
          if (element.readyState >= 2 && timestamp > previous) {
            origin ??= timestamp
            const elapsed = timestamp - origin
            if (elapsed >= 6000 || capture.current!.landmarks.length >= 90) { void finish(); return }
            if (elapsed >= next) {
              previous = timestamp
              next = (Math.floor(elapsed / (1000 / 15)) + 1) * (1000 / 15)
              const detected = instance.detectForVideo(element, timestamp)
              const { values, mask } = packHands(detected)
              capture.current!.landmarks.push(values); capture.current!.point_mask.push(mask); capture.current!.timestamps_ms.push(elapsed)
              setHands(Number(mask.slice(0, 21).some(Boolean)) + Number(mask.slice(21).some(Boolean)))
              setCount(capture.current!.landmarks.length)
            }
          }
          raf.current = requestAnimationFrame(loop)
        } catch (e) {
          running.current = false; instance.close(); detector.current = null; capture.current = null
          setPhase('idle'); setError(e instanceof Error ? e.message : 'Falló la captura.')
        }
      }
      raf.current = requestAnimationFrame(loop)
    } catch (e) {
      if (token === generation.current) { setPhase('idle'); setError(e instanceof Error ? e.message : 'No se pudo preparar la captura.') }
    }
  }

  return <div className="mx-auto max-w-5xl space-y-6 px-5 py-10">
    <h1 className="text-3xl font-bold">Reconocimiento de señas aisladas</h1>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">Prototipo experimental de baja precisión. La validación con personas nuevas está pendiente. Puede equivocarse incluso cuando muestra confianza alta. No traduce conversaciones.</p>
    <div role="group" aria-label="Modo de reconocimiento" className="flex flex-wrap gap-3">
      <Button variant={mode === 'manual' ? 'default' : 'outline'} aria-pressed={mode === 'manual'} disabled={phase !== 'idle'} onClick={() => { setMode('manual'); setResult(null) }}>Manual</Button>
      <Button variant={mode === 'auto' ? 'default' : 'outline'} aria-pressed={mode === 'auto'} disabled={phase !== 'idle'} onClick={() => { setMode('auto'); setResult(null) }}>Automático experimental</Button>
      <Button variant={mode === 'fingers' ? 'default' : 'outline'} aria-pressed={mode === 'fingers'} disabled={phase !== 'idle'} onClick={() => { setMode('fingers'); setResult(null); setMessage('Activa la cámara. Este modo muestra los dedos sin conectar el servidor.') }}>Ver dedos</Button>
    </div>
    {mode === 'fingers' && <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">21 puntos por mano: muñeca y articulaciones de los cinco dedos, unidos por líneas verdes. Detecta ambas manos; este modo visualiza su posición, no identifica palabras ni cuenta dedos extendidos.</p>}
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => void activate()} disabled={cameraOn || phase !== 'idle'}>{phase === 'camera' ? 'Esperando permiso…' : 'Activar cámara'}</Button>
      {mode !== 'fingers' && <Button variant="outline" onClick={() => void connect()} disabled={phase !== 'idle' || connecting}>{connecting ? 'Conectando…' : 'Conectar servidor'}</Button>}
      <Button variant="outline" onClick={stop}>Detener / cancelar</Button>
    </div>
    <p role="status" aria-live="polite">{message}</p>
    {mode !== 'fingers' && <p className="text-sm text-slate-600" role="status">{connecting ? 'Iniciando servidor… puede tardar alrededor de un minuto. Puedes activar la cámara mientras esperas.' : model?.ready ? 'Servidor listo para reconocer.' : 'Servidor sin conectar. Puedes probar la cámara sin conectarlo.'}</p>}
    {mode !== 'fingers' && connectionError && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">{connectionError} La cámara funciona independientemente del servidor.</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
      <video ref={video} autoPlay playsInline muted className="h-full w-full object-contain" />
      {!cameraOn && <div className="absolute inset-0 flex items-center justify-center text-white">La cámara está desactivada</div>}
      {mode === 'fingers' && <FingerTracker video={video.current} enabled={cameraOn} />}
    </div>
    {mode === 'auto' && <AutomaticRecognizer video={video.current} enabled={cameraOn && !!model?.ready} onResult={setResult} />}
    {mode === 'manual' && <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => void start()} disabled={!cameraOn || phase !== 'idle' || !model?.ready}>Iniciar seña</Button>
      <Button onClick={() => void finish()} disabled={phase !== 'capturing'}>Terminar y reconocer</Button>
      <span>{phase === 'capturing' ? `${count} fotogramas · ${hands} mano(s) detectada(s)` : 'Una seña por intento'}</span>
    </div>}
    {result && <section aria-live="polite" className="rounded-xl border bg-white p-6">
      <h2 className="font-semibold">Resultado experimental</h2>
      <p className="my-3 text-3xl">{result.glosa ?? (result.estado === 'captura_insuficiente' ? 'Captura insuficiente' : 'No concluyente')}</p>
      {result.confidence !== null && <p>Confianza del modelo: {(result.confidence * 100).toFixed(1)} % (no calibrada).</p>}
      {result.glosa && onVerEnDiccionario && <Button variant="outline" className="mt-3" onClick={() => onVerEnDiccionario(result.glosa!)}>Consultar en diccionario</Button>}
    </section>}
    {mode !== 'fingers' && model && <section><h2 className="font-semibold">Vocabulario experimental</h2><p className="mt-2 text-slate-600">{model.clases.join(', ')}</p></section>}
    <p className="text-sm text-slate-500">{mode === 'fingers' ? 'El seguimiento de dedos se procesa en tu dispositivo. Este modo no envía puntos ni imágenes al servidor.' : 'La cámara se procesa en tu dispositivo. Se envían puntos y tiempos al servidor para reconocer la seña; no se envía el video.'}</p>
  </div>
}

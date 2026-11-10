'use client'

import { useEffect, useRef, useState } from 'react'
import type { HolisticLandmarker } from '@mediapipe/tasks-vision'
import { conectarModelo, predecirSena, type ModelState, type PrediccionLSP } from '@/lib/api'
import { CONTRACT, EXTRACTOR_SHA, packHands, type Capture } from '@/lib/recognition-contract'
import { EXTRACTOR_RUNTIME } from '@/lib/runtime-contract'
import { Button } from '@/components/ui/button'

type Phase = 'idle' | 'connecting' | 'camera' | 'preparing' | 'capturing' | 'sending'

export function Recognizer({ onVerEnDiccionario }: { onVerEnDiccionario?: (glosa: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const detector = useRef<HolisticLandmarker | null>(null)
  const raf = useRef<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const running = useRef(false)
  const capture = useRef<Capture | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [model, setModel] = useState<ModelState | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [message, setMessage] = useState('Conecta el servidor para consultar el vocabulario disponible.')
  const [error, setError] = useState('')
  const [count, setCount] = useState(0)
  const [hands, setHands] = useState(0)
  const [result, setResult] = useState<PrediccionLSP | null>(null)

  const release = () => {
    generation.current++
    running.current = false
    abort.current?.abort()
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
    setMessage('Captura detenida. Puedes volver a activar la cámara.')
  }

  const connect = async () => {
    const token = ++generation.current
    abort.current?.abort()
    const controller = new AbortController(); abort.current = controller
    setPhase('connecting'); setError(''); setModel(null)
    setMessage('Iniciando servidor… puede tardar alrededor de un minuto.')
    try {
      const state = await conectarModelo(controller.signal)
      if (token !== generation.current) return
      if (!state.ready || state.contract !== CONTRACT || state.extractor_sha256 !== EXTRACTOR_SHA) throw new Error('La versión del servidor no es compatible con esta interfaz.')
      setModel(state); setMessage('Servidor listo. Activa la cámara y realiza una sola seña por intento.')
    } catch (e) {
      if (token === generation.current) setError(e instanceof Error ? e.message : 'No se pudo conectar.')
    } finally {
      if (token === generation.current) setPhase('idle')
    }
  }

  const activate = async () => {
    const token = ++generation.current
    setPhase('camera'); setError('')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      if (token !== generation.current) { media.getTracks().forEach(t => t.stop()); return }
      stream.current = media
      if (!video.current) throw new Error('No se pudo preparar la vista de cámara.')
      video.current.srcObject = media
      await video.current.play()
      if (token !== generation.current) return
      setCameraOn(true); setMessage('Pulsa «Iniciar seña» cuando estés preparado.')
    } catch (e) {
      if (token === generation.current) {
        stream.current?.getTracks().forEach(t => t.stop()); stream.current = null
        setCameraOn(false); setError(e instanceof Error ? e.message : 'No se pudo activar la cámara.')
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
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => void connect()} disabled={phase !== 'idle' || cameraOn}>{phase === 'connecting' ? 'Conectando…' : 'Conectar servidor'}</Button>
      <Button variant="outline" onClick={() => void activate()} disabled={!model?.ready || cameraOn || phase !== 'idle'}>Activar cámara</Button>
      <Button variant="outline" onClick={stop}>Detener / cancelar</Button>
    </div>
    <p role="status" aria-live="polite">{message}</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
      <video ref={video} autoPlay playsInline muted className="h-full w-full object-contain" />
      {!cameraOn && <div className="absolute inset-0 flex items-center justify-center text-white">La cámara está desactivada</div>}
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => void start()} disabled={!cameraOn || phase !== 'idle' || !model?.ready}>Iniciar seña</Button>
      <Button onClick={() => void finish()} disabled={phase !== 'capturing'}>Terminar y reconocer</Button>
      <span>{phase === 'capturing' ? `${count} fotogramas · ${hands} mano(s) detectada(s)` : 'Una seña por intento'}</span>
    </div>
    {result && <section aria-live="polite" className="rounded-xl border bg-white p-6">
      <h2 className="font-semibold">Resultado experimental</h2>
      <p className="my-3 text-3xl">{result.glosa ?? (result.estado === 'captura_insuficiente' ? 'Captura insuficiente' : 'No concluyente')}</p>
      {result.confidence !== null && <p>Confianza del modelo: {(result.confidence * 100).toFixed(1)} % (no calibrada).</p>}
      {result.glosa && onVerEnDiccionario && <Button variant="outline" className="mt-3" onClick={() => onVerEnDiccionario(result.glosa!)}>Consultar en diccionario</Button>}
    </section>}
    {model && <section><h2 className="font-semibold">Vocabulario experimental</h2><p className="mt-2 text-slate-600">{model.clases.join(', ')}</p></section>}
    <p className="text-sm text-slate-500">La cámara se procesa en tu dispositivo. Se envían puntos y tiempos al servidor para reconocer la seña; no se envía el video.</p>
  </div>
}

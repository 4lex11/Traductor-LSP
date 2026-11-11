'use client'

import { useEffect, useRef, useState } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'

// Índices anatómicos MediaPipe: muñeca y cuatro puntos por dedo.
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]

export function FingerTracker({ video, enabled }: { video: HTMLVideoElement | null; enabled: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('Activa la cámara para ver los dedos.')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!enabled || !video || !canvas.current) return
    const surface = canvas.current
    const ctx = surface.getContext('2d')
    if (!ctx) { setError('Este navegador no permite dibujar los puntos de las manos.'); return }
    const controller = new AbortController()
    let disposed = false, raf = 0, previous = -1, lastFrame = performance.now()
    let detector: HandLandmarker | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const visibility = () => { lastFrame = performance.now(); ctx.clearRect(0, 0, surface.width, surface.height) }
    document.addEventListener('visibilitychange', visibility)
    const cleanup = () => {
      disposed = true; controller.abort(); cancelAnimationFrame(raf); clearTimeout(timer)
      detector?.close(); detector = null
      document.removeEventListener('visibilitychange', visibility)
      ctx.clearRect(0, 0, surface.width, surface.height)
    }
    const fail = (message: string) => { cleanup(); setError(message); setStatus('Seguimiento detenido.') }
    setError(''); setStatus('Cargando detector de manos…')
    timer = setTimeout(() => fail('El detector tardó demasiado en cargar. Comprueba la conexión y reintenta.'), 60000)
    const boot = async () => {
      try {
        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
        if (disposed) return
        const response = await fetch('/mediapipe/hand_landmarker.task', { signal: controller.signal })
        if (!response.ok) throw new Error('No se pudo descargar el detector de dedos.')
        const bytes = await response.arrayBuffer()
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
        if (disposed) return
        const ready = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetBuffer: new Uint8Array(bytes), delegate: 'CPU' },
          runningMode: 'VIDEO', numHands: 2,
          minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        })
        if (disposed) { ready.close(); return }
        detector = ready; clearTimeout(timer); lastFrame = performance.now()
        const loop = () => {
          if (disposed || !detector) return
          try {
            if (document.hidden) {
              lastFrame = performance.now()
              raf = requestAnimationFrame(loop); return
            }
            const timestamp = Math.round(video.currentTime * 1000)
            if (performance.now() - lastFrame > 8000) { fail('La cámara dejó de entregar imágenes. Detén y vuelve a activar la cámara.'); return }
            if (video.readyState >= 2 && timestamp > previous && (previous < 0 || timestamp - previous >= 1000 / 15)) {
              previous = timestamp; lastFrame = performance.now()
              if (surface.width !== video.videoWidth || surface.height !== video.videoHeight) {
                surface.width = video.videoWidth; surface.height = video.videoHeight
              }
              const result = detector.detectForVideo(video, timestamp)
              const hands = result.landmarks
                .filter(hand => hand.length === 21 && hand.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
              ctx.clearRect(0, 0, surface.width, surface.height)
              const scale = Math.max(1, surface.width / 640)
              for (const hand of hands) {
                ctx.beginPath()
                for (const [a, b] of CONNECTIONS) {
                  ctx.moveTo(hand[a].x * surface.width, hand[a].y * surface.height)
                  ctx.lineTo(hand[b].x * surface.width, hand[b].y * surface.height)
                }
                ctx.lineWidth = 5 * scale; ctx.strokeStyle = '#111827'; ctx.stroke()
                ctx.lineWidth = 3 * scale; ctx.strokeStyle = '#22c55e'; ctx.stroke()
                for (const point of hand) {
                  ctx.beginPath(); ctx.arc(point.x * surface.width, point.y * surface.height, 4 * scale, 0, Math.PI * 2)
                  ctx.fillStyle = '#ef4444'; ctx.fill()
                  ctx.lineWidth = scale; ctx.strokeStyle = '#ffffff'; ctx.stroke()
                }
              }
              setStatus(hands.length ? `${hands.length} mano(s) · ${hands.length * 21} puntos detectados` : 'No se ven manos. Muéstralas completas, con buena iluminación.')
            }
            raf = requestAnimationFrame(loop)
          } catch (e) { if (!disposed) fail(e instanceof Error ? e.message : 'Falló el seguimiento de dedos.') }
        }
        raf = requestAnimationFrame(loop)
      } catch (e) { if (!disposed) fail(e instanceof Error ? e.message : 'No se pudo cargar el detector.') }
    }
    void boot()
    return cleanup
  }, [enabled, video, retry])

  return <>
    <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
    <div className="absolute inset-x-2 bottom-2 rounded-lg bg-slate-950/90 p-3 text-sm text-white">
      <p role="status">{enabled ? status : 'Activa la cámara para ver los dedos.'}</p>
      {enabled && error && <><p role="alert" className="mt-1">{error}</p><button className="mt-2 rounded border border-white px-3 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => setRetry(n => n + 1)}>Reintentar detector</button></>}
    </div>
  </>
}

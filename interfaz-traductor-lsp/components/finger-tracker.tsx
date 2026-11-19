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
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled || !video || !canvas.current) return
    const surface = canvas.current
    const ctx = surface.getContext('2d')
    if (!ctx) {
      setFailed(true)
      return
    }

    const controller = new AbortController()
    let disposed = false
    let raf = 0
    let previous = -1
    let lastFrame = performance.now()
    let detector: HandLandmarker | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const visibility = () => {
      lastFrame = performance.now()
      ctx.clearRect(0, 0, surface.width, surface.height)
    }
    document.addEventListener('visibilitychange', visibility)

    const cleanup = () => {
      disposed = true
      controller.abort()
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      detector?.close()
      detector = null
      document.removeEventListener('visibilitychange', visibility)
      ctx.clearRect(0, 0, surface.width, surface.height)
    }

    const fail = () => {
      cleanup()
      setFailed(true)
    }

    setFailed(false)
    timer = setTimeout(fail, 60000)

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
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
        if (disposed) {
          ready.close()
          return
        }
        detector = ready
        clearTimeout(timer)
        lastFrame = performance.now()

        const loop = () => {
          if (disposed || !detector) return
          try {
            if (document.hidden) {
              lastFrame = performance.now()
              raf = requestAnimationFrame(loop)
              return
            }
            const timestamp = Math.round(video.currentTime * 1000)
            if (performance.now() - lastFrame > 8000) {
              fail()
              return
            }
            if (video.readyState >= 2 && timestamp > previous && (previous < 0 || timestamp - previous >= 1000 / 15)) {
              previous = timestamp
              lastFrame = performance.now()
              if (surface.width !== video.videoWidth || surface.height !== video.videoHeight) {
                surface.width = video.videoWidth
                surface.height = video.videoHeight
              }
              const result = detector.detectForVideo(video, timestamp)
              const hands = result.landmarks.filter(hand =>
                hand.length === 21 && hand.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))
              )
              ctx.clearRect(0, 0, surface.width, surface.height)
              const scale = Math.max(1, surface.width / 640)
              for (const hand of hands) {
                ctx.beginPath()
                for (const [a, b] of CONNECTIONS) {
                  ctx.moveTo(hand[a].x * surface.width, hand[a].y * surface.height)
                  ctx.lineTo(hand[b].x * surface.width, hand[b].y * surface.height)
                }
                ctx.lineWidth = 5 * scale
                ctx.strokeStyle = '#111827'
                ctx.stroke()
                ctx.lineWidth = 3 * scale
                ctx.strokeStyle = '#22c55e'
                ctx.stroke()
                for (const point of hand) {
                  ctx.beginPath()
                  ctx.arc(point.x * surface.width, point.y * surface.height, 4 * scale, 0, Math.PI * 2)
                  ctx.fillStyle = '#ef4444'
                  ctx.fill()
                  ctx.lineWidth = scale
                  ctx.strokeStyle = '#ffffff'
                  ctx.stroke()
                }
              }
            }
            raf = requestAnimationFrame(loop)
          } catch {
            if (!disposed) fail()
          }
        }
        raf = requestAnimationFrame(loop)
      } catch {
        if (!disposed) fail()
      }
    }

    void boot()
    return cleanup
  }, [enabled, video])

  return (
    <>
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
      />
      {failed && (
        <p role="alert" className="absolute left-3 top-3 rounded-lg bg-red-950/95 px-3 py-2 text-xs font-medium text-white">
          Seguimiento no disponible. Desactiva y activa el interruptor para reintentar.
        </p>
      )}
    </>
  )
}

'use client'

import { useEffect, useRef } from 'react'
import type { HolisticLandmarker } from '@mediapipe/tasks-vision'
import { AutoSegmenter } from '@/lib/auto-segmenter'
import { CONTRACT, EXTRACTOR_SHA, packHands } from '@/lib/recognition-contract'
import { EXTRACTOR_RUNTIME } from '@/lib/runtime-contract'
import { predecirSena, type PrediccionLSP } from '@/lib/api'

export type AutomaticRecognitionState = 'idle' | 'preparing' | 'waiting' | 'capturing' | 'processing'

type AutomaticRecognizerProps = {
  video: HTMLVideoElement | null
  enabled: boolean
  onResult: (result: PrediccionLSP) => void
  onStateChange: (state: AutomaticRecognitionState) => void
  onError: (message: string) => void
}

/**
 * Reconoce señas aisladas de forma automática mientras la cámara esté activa.
 * No dibuja la interfaz: el resultado y los mensajes los muestra la página.
 */
export function AutomaticRecognizer({ video, enabled, onResult, onStateChange, onError }: AutomaticRecognizerProps) {
  const callbacks = useRef({ onResult, onStateChange, onError })

  useEffect(() => {
    callbacks.current = { onResult, onStateChange, onError }
  }, [onResult, onStateChange, onError])

  useEffect(() => {
    if (!enabled || !video) {
      callbacks.current.onStateChange('idle')
      return
    }

    const controller = new AbortController()
    const segmenter = new AutoSegmenter()
    let instance: HolisticLandmarker | null = null
    let disposed = false
    let raf = 0
    let lastTime = -1
    let watchdog: ReturnType<typeof setTimeout> | undefined
    let lastFrameAt = performance.now()
    let reported: AutomaticRecognitionState = 'idle'
    const resetFrameWatchdog = () => { lastFrameAt = performance.now() }
    document.addEventListener('visibilitychange', resetFrameWatchdog)

    const report = (state: AutomaticRecognitionState) => {
      if (reported === state) return
      reported = state
      callbacks.current.onStateChange(state)
    }

    const cleanup = () => {
      disposed = true
      controller.abort()
      cancelAnimationFrame(raf)
      clearTimeout(watchdog)
      document.removeEventListener('visibilitychange', resetFrameWatchdog)
      instance?.close()
      instance = null
    }

    const fail = (message: string) => {
      if (disposed) return
      cleanup()
      report('idle')
      callbacks.current.onError(message)
    }

    report('preparing')
    watchdog = setTimeout(() => fail('El reconocimiento tardó demasiado en iniciar. Desactiva y activa la cámara para reintentar.'), 60000)

    const boot = async () => {
      try {
        const { createDetector } = await import('@/lib/holistic-extractor')
        if (disposed) return
        const ready = await createDetector('/mediapipe', controller.signal)
        if (disposed) {
          ready.close()
          return
        }
        instance = ready
        clearTimeout(watchdog)
        lastFrameAt = performance.now()
        report('waiting')

        const loop = async () => {
          if (disposed || !instance) return
          try {
            if (document.hidden) {
              lastFrameAt = performance.now()
              raf = requestAnimationFrame(() => { void loop() })
              return
            }
            const timestamp = Math.round(video.currentTime * 1000)
            if (performance.now() - lastFrameAt > 8000) {
              fail('La cámara dejó de entregar imágenes. Desactívala y vuelve a activarla.')
              return
            }
            if (video.readyState >= 2 && timestamp > lastTime && (lastTime < 0 || timestamp - lastTime >= 1000 / 15)) {
              lastTime = timestamp
              lastFrameAt = performance.now()
              const packed = packHands(instance.detectForVideo(video, timestamp))
              const frames = segmenter.push({ ...packed, time: timestamp })
              if (frames) {
                report('processing')
                // No se programa otro fotograma hasta terminar esta petición.
                const prediction = await predecirSena({
                  contract: CONTRACT,
                  extractor_sha256: EXTRACTOR_SHA,
                  ...{ extractor_runtime: EXTRACTOR_RUNTIME },
                  landmarks: frames.map(frame => frame.values),
                  point_mask: frames.map(frame => frame.mask),
                  timestamps_ms: frames.map(frame => frame.time - frames[0].time),
                  width: video.videoWidth,
                  height: video.videoHeight,
                }, controller.signal, false)
                if (disposed) return
                callbacks.current.onResult(prediction)
                segmenter.resetAfterResult(Math.round(video.currentTime * 1000))
                lastFrameAt = performance.now()
                report('waiting')
              } else {
                report(segmenter.state === 'capturing' ? 'capturing' : 'waiting')
              }
            }
            raf = requestAnimationFrame(() => { void loop() })
          } catch (error) {
            if (!disposed) fail(error instanceof Error ? error.message : 'No se pudo procesar la seña.')
          }
        }
        raf = requestAnimationFrame(() => { void loop() })
      } catch (error) {
        if (!disposed) fail(error instanceof Error ? error.message : 'No se pudo iniciar el reconocimiento.')
      }
    }

    void boot()
    return cleanup
  }, [enabled, video])

  return null
}

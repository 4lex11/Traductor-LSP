'use client'

import { useEffect, useState } from 'react'
import type { HolisticLandmarker } from '@mediapipe/tasks-vision'
import { AutoSegmenter } from '@/lib/auto-segmenter'
import { CONTRACT, EXTRACTOR_SHA, packHands } from '@/lib/recognition-contract'
import { EXTRACTOR_RUNTIME } from '@/lib/runtime-contract'
import { predecirSena, type PrediccionLSP } from '@/lib/api'
import { Button } from '@/components/ui/button'

export function AutomaticRecognizer({ video, enabled, onResult, reference = false }: {
  reference?: boolean
  video: HTMLVideoElement | null
  enabled: boolean
  onResult: (result: PrediccionLSP) => void
}) {
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState('Conecta el servidor y activa la cámara para comenzar.')
  const [error, setError] = useState('')
  const [hands, setHands] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled || !video || paused) return
    const controller = new AbortController()
    const segmenter = new AutoSegmenter()
    let instance: HolisticLandmarker | null = null
    let disposed = false, raf = 0, lastTime = -1
    let watchdog: ReturnType<typeof setTimeout> | undefined
    let lastFrameAt = performance.now()
    const cleanup = () => {
      disposed = true; controller.abort(); cancelAnimationFrame(raf)
      clearTimeout(watchdog); instance?.close(); instance = null
    }
    const fail = (message: string) => {
      cleanup(); setError(message); setStatus('Modo automático detenido.'); setPaused(true)
    }
    const visibility = () => {
      if (document.hidden) { cleanup(); setPaused(true); setStatus('Pausado al cambiar de pestaña.') }
    }
    document.addEventListener('visibilitychange', visibility)
    setError(''); setHands(0); setStatus('Preparando detector… la primera carga puede tardar.')
    watchdog = setTimeout(() => fail('El detector tardó demasiado en iniciar. Comprueba la conexión y pulsa Reanudar automático.'), 60000)

    const boot = async () => {
      try {
        const { createDetector } = await import('@/lib/holistic-extractor')
        if (disposed) return
        const ready = await createDetector('/mediapipe', controller.signal)
        if (disposed) { ready.close(); return }
        instance = ready; clearTimeout(watchdog)
        if (document.hidden) { visibility(); return }
        lastFrameAt = performance.now()
        setStatus('Esperando movimiento. Realiza una seña y termina con una pausa.')
        const loop = async () => {
          if (disposed || !instance) return
          try {
            const timestamp = Math.round(video.currentTime * 1000)
            if (performance.now() - lastFrameAt > 8000) { fail('La cámara dejó de entregar imágenes. Detén y vuelve a activar la cámara.'); return }
            if (video.readyState >= 2 && timestamp > lastTime && (lastTime < 0 || timestamp - lastTime >= 1000 / 15)) {
              lastTime = timestamp; lastFrameAt = performance.now()
              const packed = packHands(instance.detectForVideo(video, timestamp))
              setHands(Number(packed.mask.slice(0, 21).some(Boolean)) + Number(packed.mask.slice(21).some(Boolean)))
              const frames = segmenter.push({ ...packed, time: timestamp })
              if (frames) {
                setStatus('Procesando seña… espera el resultado antes de realizar la siguiente.')
                // No programar otro frame hasta terminar esta petición: nunca hay envíos simultáneos.
                const prediction = await predecirSena({
                  contract: CONTRACT, extractor_sha256: EXTRACTOR_SHA,
                  ...{ extractor_runtime: EXTRACTOR_RUNTIME },
                  landmarks: frames.map(f => f.values), point_mask: frames.map(f => f.mask),
                  timestamps_ms: frames.map(f => f.time - frames[0].time),
                  width: video.videoWidth, height: video.videoHeight,
                }, controller.signal, reference)
                if (disposed) return
                onResult(prediction); setAttempt(n => n + 1)
                segmenter.resetAfterResult(Math.round(video.currentTime * 1000))
                lastFrameAt = performance.now()
              }
              setStatus(segmenter.state === 'capturing' ? 'Capturando seña… haz una pausa al terminar.'
                : segmenter.state === 'rest' ? 'Resultado listo o movimiento descartado. Deja las manos quietas un momento antes de la siguiente seña.'
                : 'Esperando movimiento. Realiza una seña y termina con una pausa.')
            }
            raf = requestAnimationFrame(() => { void loop() })
          } catch (e) {
            if (!disposed) fail(e instanceof Error ? e.message : 'Falló el reconocimiento automático.')
          }
        }
        raf = requestAnimationFrame(() => { void loop() })
      } catch (e) {
        if (!disposed) fail(e instanceof Error ? e.message : 'No se pudo iniciar el detector.')
      }
    }
    void boot()
    return () => { cleanup(); document.removeEventListener('visibilitychange', visibility) }
  }, [enabled, video, paused, onResult, reference])

  return <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Modo automático">
    <p className="font-semibold">Automático experimental</p>
    <p className="text-sm">Haz una seña aislada, pausa y espera el resultado. Mantén las manos quietas antes de la siguiente. Las pausas dentro de una seña pueden dividirla; usa el modo manual si ocurre.</p>
    <p role="status">{enabled ? status : 'Activa la cámara y conecta el servidor para comenzar.'}</p>
    <p className="text-sm">{enabled && !paused ? `${hands} mano(s) detectada(s) · ` : ''}{attempt} captura(s) procesada(s)</p>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    <Button variant="outline" disabled={!enabled} onClick={() => { setPaused(p => !p); setStatus(paused ? 'Preparando detector…' : 'Automático pausado.') }}>{paused ? 'Reanudar automático' : 'Pausar automático'}</Button>
  </section>
}

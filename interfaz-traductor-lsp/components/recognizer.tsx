'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { AlertCircle, Camera, CameraOff, Hand } from 'lucide-react'
import { conectarModelo, type PrediccionLSP } from '@/lib/api'
import { CONTRACT, EXTRACTOR_SHA } from '@/lib/recognition-contract'
import { cameraError, requestCamera } from '@/lib/camera'
import { Button } from '@/components/ui/button'
import { AutomaticRecognizer, type AutomaticRecognitionState } from '@/components/automatic-recognizer'
import { FingerTracker } from '@/components/finger-tracker'
import { cn } from '@/lib/utils'
import { drawPoseOverlay } from '@/lib/pose-overlay'

type CameraState = 'off' | 'starting' | 'on'
type ConnectionState = 'connecting' | 'ready' | 'error'

function shortCameraError(error: unknown): string {
  const detail = cameraError(error)
  if (detail.startsWith('El acceso a la cámara está bloqueado')) return 'Permiso de cámara denegado. Habilítalo en el navegador.'
  if (detail.startsWith('No se encontró')) return 'No se encontró una cámara disponible.'
  if (detail.startsWith('No se pudo abrir')) return 'La cámara no está disponible. Cierra otras aplicaciones que la usen.'
  if (detail.startsWith('La cámara requiere HTTPS')) return 'La cámara requiere una conexión segura (HTTPS).'
  return 'No se pudo activar la cámara.'
}

function resultMessage(
  camera: CameraState,
  connection: ConnectionState,
  recognition: AutomaticRecognitionState,
  result: PrediccionLSP | null,
  connectionError: string,
): string {
  if (connection === 'connecting') return 'Conectando con el servidor…'
  if (connection === 'error') return connectionError || 'No se pudo conectar con el servidor.'
  if (camera === 'starting') return 'Activando cámara…'
  if (camera === 'off') return 'Activa la cámara para comenzar.'
  if (result?.estado === 'resultado_experimental' && result.glosa) return result.glosa
  if (result?.estado === 'captura_insuficiente') return 'No se reconoció una seña.'
  if (result?.estado === 'no_concluyente') return 'Seña no reconocida.'
  if (recognition === 'preparing') return 'Preparando el reconocimiento…'
  if (recognition === 'capturing') return 'Capturando seña…'
  if (recognition === 'processing') return 'Procesando seña…'
  return 'Esperando una seña…'
}

export function Recognizer() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const poseCanvas = useRef<HTMLCanvasElement>(null)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const cameraGeneration = useRef(0)
  const connectionGeneration = useRef(0)
  const connectionAbort = useRef<AbortController | null>(null)

  const [cameraState, setCameraState] = useState<CameraState>('off')
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [connectionError, setConnectionError] = useState('')
  const [cameraError, setCameraError] = useState('')
  const [recognitionError, setRecognitionError] = useState('')
  const [recognitionState, setRecognitionState] = useState<AutomaticRecognitionState>('idle')
  const [ahoraTrial, setAhoraTrial] = useState(false)
  const [result, setResult] = useState<PrediccionLSP | null>(null)
  const [showTracking, setShowTracking] = useState(true)
  const [videoAspect, setVideoAspect] = useState<number | null>(null)

  const handlePose = useCallback((pose: readonly NormalizedLandmark[], width: number, height: number) => {
    if (poseCanvas.current) drawPoseOverlay(poseCanvas.current, pose, width, height)
  }, [])

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    setVideoElement(node)
  }, [])

  const connect = useCallback(async () => {
    const token = ++connectionGeneration.current
    connectionAbort.current?.abort()
    const controller = new AbortController()
    connectionAbort.current = controller
    setConnectionState('connecting')
    setConnectionError('')
    setAhoraTrial(false)
    try {
      const state = await conectarModelo(controller.signal)
      if (token !== connectionGeneration.current) return
      if (!state.ready || state.contract !== CONTRACT || state.extractor_sha256 !== EXTRACTOR_SHA) {
        throw new Error('La versión del servidor no es compatible.')
      }
      setAhoraTrial(state.prueba_ahora_disponible === true &&
        new URLSearchParams(window.location.search).get('prueba') === 'ahora')
      setConnectionState('ready')
    } catch (error) {
      if (token !== connectionGeneration.current) return
      setConnectionState('error')
      setConnectionError(error instanceof Error && error.message.includes('compatible')
        ? 'La versión del servidor no es compatible.'
        : 'No se pudo conectar con el servidor. Puede estar iniciándose.')
    }
  }, [])

  const stopCamera = useCallback((message = '') => {
    cameraGeneration.current++
    const media = stream.current
    stream.current = null
    media?.getTracks().forEach(track => track.stop())
    const video = videoRef.current
    if (video) {
      video.pause()
      video.srcObject = null
    }
    setCameraState('off')
    setCameraError(message)
    setRecognitionError('')
    setRecognitionState('idle')
    setResult(null)
  }, [])

  const activateCamera = useCallback(async () => {
    const token = ++cameraGeneration.current
    setCameraError('')
    setRecognitionError('')
    setResult(null)
    setCameraState('starting')
    if (connectionState === 'error') void connect()
    try {
      const media = await requestCamera(navigator.mediaDevices, window.isSecureContext, true)
      if (token !== cameraGeneration.current) {
        media.getTracks().forEach(track => track.stop())
        return
      }
      stream.current = media
      const video = videoRef.current
      if (!video) throw new Error('No se pudo preparar la vista de cámara.')
      video.srcObject = media
      await video.play()
      if (token !== cameraGeneration.current) return
      setCameraState('on')
      media.getVideoTracks().forEach(track => {
        track.addEventListener('ended', () => {
          if (stream.current !== media) return
          stopCamera('La cámara se desconectó. Vuelve a activarla.')
        }, { once: true })
      })
    } catch (error) {
      if (token !== cameraGeneration.current) return
      stream.current?.getTracks().forEach(track => track.stop())
      stream.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      setCameraState('off')
      setCameraError(shortCameraError(error))
    }
  }, [connect, connectionState, stopCamera])

  const handleRecognitionState = useCallback((next: AutomaticRecognitionState) => {
    setRecognitionState(next)
    if (next === 'capturing') setResult(null)
    if (next !== 'idle') setRecognitionError('')
  }, [])

  const handleResult = useCallback((prediction: PrediccionLSP) => {
    setResult(prediction)
    setRecognitionError('')
  }, [])

  const handleRecognitionError = useCallback((message: string) => {
    setRecognitionError(message)
    setRecognitionState('idle')
  }, [])

  useEffect(() => {
    void connect()
    return () => {
      connectionGeneration.current++
      connectionAbort.current?.abort()
    }
  }, [connect])

  useEffect(() => () => {
    cameraGeneration.current++
    const media = stream.current
    stream.current = null
    media?.getTracks().forEach(track => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const cameraOn = cameraState === 'on'
  const recognitionEnabled = cameraOn && connectionState === 'ready' && !!videoElement
  const message = resultMessage(cameraState, connectionState, recognitionState, result, connectionError)
  const isRecognized = result?.estado === 'resultado_experimental' && !!result.glosa

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 sm:mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">Lengua de Señas Peruana</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Reconocer seña</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Vocabulario cerrado · una seña a la vez. No es traducción continua.
        </p>
      </header>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch">
          <Button
            type="button"
            size="lg"
            variant={cameraOn ? 'destructive' : 'default'}
            className="h-12 w-full text-base sm:w-auto"
            onClick={() => { if (cameraOn) stopCamera(); else void activateCamera() }}
            disabled={cameraState === 'starting'}
            aria-pressed={cameraOn}
          >
            {cameraState === 'starting'
              ? <><span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Activando cámara…</>
              : cameraOn
                ? <><CameraOff data-icon="inline-start" />Desactivar cámara</>
                : <><Camera data-icon="inline-start" />Activar cámara</>}
          </Button>

          <button
            type="button"
            role="switch"
            aria-checked={showTracking}
            onClick={() => setShowTracking(value => !value)}
            className="flex min-h-12 w-full items-center justify-between gap-4 rounded-lg border border-slate-500 bg-white px-4 py-2 text-left text-sm font-semibold text-slate-800 transition-colors hover:border-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:w-auto sm:min-w-[290px]"
          >
            <span className="flex items-center gap-2">
              <Hand aria-hidden="true" className="size-5 text-blue-700" />
              Mostrar seguimiento de dedos, brazos y cabeza
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="hidden text-xs font-medium text-slate-600 min-[380px]:inline">{showTracking ? 'Activado' : 'Desactivado'}</span>
              <span
                aria-hidden="true"
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 transition-colors',
                  showTracking ? 'border-blue-700 bg-blue-700' : 'border-slate-400 bg-slate-300',
                )}
              >
                <span className={cn(
                  'absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform',
                  showTracking ? 'translate-x-5' : 'translate-x-0',
                )} />
              </span>
            </span>
          </button>
        </div>

        {cameraError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {cameraError}
          </p>
        )}
        {recognitionError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {recognitionError}
          </p>
        )}

        <div
          className="relative aspect-[4/3] max-h-[75vh] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-sm sm:aspect-video"
          style={cameraOn && videoAspect ? { aspectRatio: String(videoAspect) } : undefined}
        >
          <video
            ref={attachVideo}
            autoPlay
            playsInline
            muted
            aria-label="Vista de la cámara"
            className="h-full w-full object-contain"
            onLoadedMetadata={event => {
              const video = event.currentTarget
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                setVideoAspect(video.videoWidth / video.videoHeight)
              }
            }}
          />
          {cameraOn && showTracking && videoElement && (
            <>
              <canvas ref={poseCanvas} aria-hidden="true" data-tracking="pose"
                className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
              <FingerTracker video={videoElement} enabled />
            </>
          )}
          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-white">
              {cameraState === 'starting'
                ? <span aria-hidden="true" className="size-9 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : <CameraOff aria-hidden="true" className="size-10 text-slate-400" />}
              <p className="text-base font-semibold sm:text-lg">
                {cameraState === 'starting' ? 'Activando cámara…' : 'La cámara está desactivada'}
              </p>
              {cameraState === 'off' && <p className="text-sm text-slate-300">Actívala para empezar a reconocer señas.</p>}
            </div>
          )}
        </div>

        <section
          aria-live="polite"
          aria-atomic="true"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {ahoraTrial ? 'Prueba de AHORA' : 'Resultado'}
          </p>
          <p className={cn(
            'mt-2 text-2xl font-bold leading-tight sm:text-3xl',
            isRecognized ? 'text-slate-950' : 'text-slate-600',
          )}>
            {message}
          </p>
        </section>
      </div>

      <AutomaticRecognizer
        video={videoElement}
        enabled={recognitionEnabled}
        ahoraTrial={ahoraTrial}
        onResult={handleResult}
        onPose={handlePose}
        onStateChange={handleRecognitionState}
        onError={handleRecognitionError}
      />
    </div>
  )
}

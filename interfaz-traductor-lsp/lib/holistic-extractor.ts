import { FilesetResolver, HolisticLandmarker } from '@mediapipe/tasks-vision'
import { EXTRACTOR_SHA, HOLISTIC_THRESHOLDS } from './recognition-contract'

// Compartido por cámara y extracción offline dirigida desde Python.
export async function createDetector(base = '/mediapipe', signal?: AbortSignal) {
  const response = await fetch(`${base}/holistic_landmarker.task`, { signal })
  if (!response.ok) throw new Error('No se pudo cargar el detector de señas.')
  const bytes = await response.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
  if (hash !== EXTRACTOR_SHA) throw new Error('El detector no coincide con la versión esperada.')
  const vision = await FilesetResolver.forVisionTasks(`${base}/wasm`)
  return HolisticLandmarker.createFromOptions(vision, {
    ...HOLISTIC_THRESHOLDS,
    baseOptions: { modelAssetBuffer: new Uint8Array(bytes), delegate: 'CPU' }, runningMode: 'VIDEO',
  })
}

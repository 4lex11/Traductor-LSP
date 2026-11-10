import { EXTRACTOR_RUNTIME } from './runtime-contract'
const API_URL = (process.env.NEXT_PUBLIC_LSP_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const STATIC_CATALOG = process.env.NEXT_PUBLIC_LSP_CATALOG === 'static'

let catalogRequest: Promise<ResultadoLSP[]> | null = null
function staticCatalog() {
  catalogRequest ??= fetch('/catalog/index.json').then(async response => {
    if (!response.ok) throw new Error('No se pudo cargar el catálogo de demostración.')
    return await response.json() as ResultadoLSP[]
  }).catch(error => { catalogRequest = null; throw error })
  return catalogRequest
}

export interface VideoLSP {
  nombre: string
  url: string
}

export interface ResultadoLSP {
  palabra: string
  videos: VideoLSP[]
  total: number
}

export async function buscarSena(palabra: string): Promise<ResultadoLSP> {
  const consulta = palabra.trim()
  if (!consulta) throw new Error('Escribe una palabra para buscar.')
  if (STATIC_CATALOG) {
    const found = (await staticCatalog()).find(entry => entry.palabra.toLocaleLowerCase('es') === consulta.toLocaleLowerCase('es'))
    if (!found) throw new Error('Esta seña no está disponible en el catálogo de demostración.')
    return found
  }

  let response: Response
  try {
    response = await fetch(`${API_URL}/api/senas/${encodeURIComponent(consulta)}`)
  } catch {
    throw new Error('No se pudo conectar con FastAPI. Comprueba que esté ejecutándose en el puerto 8000.')
  }

  if (response.status === 404) {
    throw new Error('Esta seña no está disponible en el catálogo de videos.')
  }
  if (!response.ok) {
    throw new Error(`Error del servidor (${response.status}).`)
  }

  const datos: ResultadoLSP = await response.json()
  return {
    ...datos,
    videos: datos.videos.map((video) => ({
      ...video,
      url: new URL(video.url, `${API_URL}/`).href,
    })),
  }
}

export interface SenaCatalogo {
  nombre: string
  cantidad_videos: number
}

export async function listarSenas(): Promise<SenaCatalogo[]> {
  if (STATIC_CATALOG) return (await staticCatalog()).map(entry => ({nombre: entry.palabra, cantidad_videos: entry.total}))
  let response: Response
  try {
    response = await fetch(`${API_URL}/api/senas`)
  } catch {
    throw new Error('No se pudo conectar con FastAPI. Verifica el puerto 8000.')
  }
  if (!response.ok) throw new Error(`Error del catálogo (${response.status}).`)
  return (await response.json()) as SenaCatalogo[]
}

export interface PrediccionLSP {
  glosa: string | null
  confidence: number | null
  estado: 'resultado_experimental' | 'no_concluyente' | 'captura_insuficiente'
  mensaje: string
  experimental: true
}

export interface ModelState {
  ready: boolean
  extractor_runtime: string
  contract: string
  extractor_sha256: string
  clases: string[]
  mensaje: string
}

async function request(path: string, init: RequestInit, signal: AbortSignal, timeout: number): Promise<Response> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) controller.abort()
  const timer = setTimeout(cancel, timeout)
  try {
    return await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal })
  } catch {
    throw new Error(signal.aborted ? 'Operación cancelada.' : 'El servidor no responde. Puede estar iniciándose; vuelve a conectar.')
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}

export async function conectarModelo(signal: AbortSignal): Promise<ModelState> {
  // Tres comprobaciones como máximo; nunca reintentar una inferencia automáticamente.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await request('/readyz', {}, signal, 25000)
      if (response.ok) {
        const state = await response.json() as ModelState
        if (state.extractor_runtime !== EXTRACTOR_RUNTIME) throw new Error('La versión del extractor no coincide con el servidor.')
        return state
      }
    } catch (error) {
      if (signal.aborted || attempt === 2) throw error
    }
    if (signal.aborted) throw new Error('Operación cancelada.')
    if (attempt < 2) await new Promise<void>((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('El servidor está disponible, pero el modelo no está listo. Intenta conectar más tarde.')
}

export async function predecirSena(capture: import('./recognition-contract').Capture, signal: AbortSignal): Promise<PrediccionLSP> {
  const response = await request('/api/predict', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(capture),
  }, signal, 20000)
  if (!response.ok) {
    const error: { detail?: unknown } = await response.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? error.detail : `Captura no aceptada (${response.status}).`)
  }
  return await response.json() as PrediccionLSP
}

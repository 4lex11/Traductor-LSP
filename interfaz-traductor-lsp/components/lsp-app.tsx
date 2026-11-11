'use client'

import { useEffect, useRef, useState } from 'react'
import { Recognizer as Translator } from '@/components/recognizer'
import {
  Accessibility,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Clipboard,
  Clock3,
  FileText,
  Hand,
  Info,
  Languages,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Video,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buscarSena, listarSenas, type SenaCatalogo, type ResultadoLSP } from '@/lib/api'

type View = 'inicio' | 'traductor' | 'texto' | 'diccionario' | 'admin' | 'ayuda'

const dictionary = [
  { word: 'Hola', category: 'Saludos', description: 'Saludo cotidiano para iniciar una conversación.', color: 'bg-blue-50 text-blue-600' },
  { word: 'Gracias', category: 'Expresiones cotidianas', description: 'Expresión de agradecimiento.', color: 'bg-teal-50 text-teal-600' },
  { word: 'Ayuda', category: 'Solicitudes', description: 'Solicitud de apoyo o asistencia.', color: 'bg-violet-50 text-violet-600' },
  { word: '¿Cómo estás?', category: 'Preguntas frecuentes', description: 'Pregunta sobre el estado de una persona.', color: 'bg-amber-50 text-amber-600' },
  { word: 'Esperar', category: 'Atención administrativa', description: 'Indicación para aguardar un momento.', color: 'bg-rose-50 text-rose-600' },
  { word: 'Por favor', category: 'Expresiones cotidianas', description: 'Expresión de cortesía al solicitar algo.', color: 'bg-cyan-50 text-cyan-600' },
]

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'inicio', label: 'Inicio', icon: LayoutDashboard },
  { id: 'traductor', label: 'Reconocer seña', icon: Camera },
  { id: 'texto', label: 'Texto a LSP', icon: MessageSquare },
  { id: 'diccionario', label: 'Diccionario', icon: BookOpen },
  { id: 'ayuda', label: 'Ayuda', icon: CircleHelp },
]

export function LspApp() {
  const [view, setView] = useState<View>('inicio')
  const [mobileMenu, setMobileMenu] = useState(false)

  const [selectedWordForDict, setSelectedWordForDict] = useState<string | null>(null)

  const navigate = (next: View) => {
    setView(next)
    setMobileMenu(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const verEnDiccionario = (palabra: string) => {
    setSelectedWordForDict(palabra)
    navigate('diccionario')
  }

  return (
    <div className="min-h-screen bg-[#f7faff] text-slate-800">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[76px] max-w-[1280px] items-center justify-between px-5 lg:px-8">
          <button onClick={() => navigate('inicio')} className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100" aria-label="Ir al inicio">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><Hand className="size-5" /></span>
            <span className="text-left"><span className="block text-[17px] font-bold tracking-tight text-slate-900">LSP</span><span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">Comunicación sin barreras</span></span>
          </button>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegación principal">
            {navItems.map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => navigate(item.id)} />)}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="hidden text-slate-500 hover:text-blue-600 sm:inline-flex" aria-label="Accesibilidad"><Accessibility /></Button>
            <Button variant="outline" className="hidden border-slate-200 text-slate-700 sm:inline-flex" onClick={() => navigate('admin')}><Settings data-icon="inline-start" /> Administración</Button>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menú"><Menu /></Button>
          </div>
        </div>
        {mobileMenu && <nav className="border-t border-slate-100 bg-white p-3 lg:hidden" aria-label="Menú móvil">{navItems.map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => navigate(item.id)} mobile />)}</nav>}
      </header>
      <main>
        {view === 'inicio' && <Home onNavigate={navigate} />}
        {view === 'traductor' && <Translator onVerEnDiccionario={verEnDiccionario} />}
        {view === 'texto' && <TextToLsp />}
        {view === 'diccionario' && (
          <Dictionary initialWord={selectedWordForDict} onWordConsumed={() => setSelectedWordForDict(null)} />
        )}
        {view === 'admin' && <Admin />}
        {view === 'ayuda' && <Help />}
      </main>
      <footer className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-5 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8"><span>© 2026 LSP · Herramienta académica de apoyo</span><a href="/catalog/ATRIBUCION.txt" className="underline" target="_blank" rel="noreferrer">Fuentes y licencias de los videos</a><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-teal-600" /> Tus datos no se almacenan</span></div></footer>
    </div>
  )
}

function NavButton({ item, active, onClick, mobile = false }: { item: typeof navItems[number]; active: boolean; onClick: () => void; mobile?: boolean }) {
  const Icon = item.icon
  return <button onClick={onClick} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100', mobile ? 'w-full py-3' : '', active ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800')}><Icon className="size-4" />{item.label}</button>
}

function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div className="mb-8"><p className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-blue-600">{eyebrow}</p><h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-500">{description}</p></div> }

function Home({ onNavigate }: { onNavigate: (v: View) => void }) {
  return <div><section className="relative overflow-hidden border-b border-slate-200 bg-white"><div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-24"><div><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"><Sparkles className="size-3.5" /> Proyecto académico · Lima 2026</div><h1 className="max-w-2xl text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 sm:text-6xl">Comunicación <span className="text-blue-600">sin barreras.</span></h1><p className="mt-6 max-w-xl text-lg leading-8 text-slate-500">Herramienta de apoyo para la comunicación mediante Lengua de Señas Peruana.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button size="lg" className="h-12 rounded-xl bg-blue-600 px-6 hover:bg-blue-700" onClick={() => onNavigate('traductor')}>Reconocer una seña <ArrowRight data-icon="inline-end" /></Button><Button size="lg" variant="outline" className="h-12 rounded-xl border-slate-200 px-6" onClick={() => onNavigate('diccionario')}>Explorar diccionario</Button></div></div><div className="relative mx-auto w-full max-w-[480px]"><div className="absolute -inset-8 rounded-full bg-blue-100/50 blur-3xl" /><div className="relative rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-blue-100/40"><div className="rounded-2xl bg-slate-900 p-5"><div className="mb-12 flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-medium text-slate-300"><span className="size-2 rounded-full bg-teal-400" /> Modo demostración</span><Video className="size-4 text-slate-400" /></div><div className="mx-auto flex size-32 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10"><Hand className="size-16 text-blue-300" /></div><div className="mt-8 rounded-xl bg-white/10 p-3 text-center text-sm text-white">Coloca tus manos dentro del encuadre</div></div><div className="flex items-center justify-between px-2 pt-4"><span className="text-sm text-slate-500">Reconocimiento de señas</span><span className="flex items-center gap-1.5 text-xs font-medium text-teal-600"><span className="size-2 rounded-full bg-teal-500" /> Listo para empezar</span></div></div></div></div></section><section className="mx-auto max-w-[1280px] px-5 py-16 lg:px-8"><div className="mb-7 flex items-end justify-between"><div><p className="text-sm font-semibold text-blue-600">Elige cómo comunicarte</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Dos formas de empezar</h2></div><span className="hidden text-sm text-slate-400 sm:block">Proyecto académico de apoyo</span></div><div className="grid gap-5 md:grid-cols-2"><ModeCard icon={Camera} title="Reconocer señas aisladas" description="Usa tu cámara para realizar una seña y visualizar su interpretación en español." action="Reconocer una seña" accent="blue" onClick={() => onNavigate('traductor')} /><ModeCard icon={MessageSquare} title="Traducir texto a señas" description="Busca una palabra o expresión disponible y consulta su referencia visual." action="Escribir mensaje" accent="teal" onClick={() => onNavigate('texto')} /></div><div className="mt-16"><div className="mb-8 text-center"><p className="text-sm font-semibold text-blue-600">Así de sencillo</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Tu comunicación en tres pasos</h2></div><div className="grid gap-8 md:grid-cols-3">{[['01','Selecciona el modo','Elige si quieres traducir una seña o consultar una referencia visual.'],['02','Realiza o escribe','Usa la cámara con tus manos en el encuadre o escribe una palabra.'],['03','Visualiza el resultado','Revisa la interpretación o el material disponible en el diccionario.']].map(([n,t,d]) => <div key={n} className="relative text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-sm font-bold text-blue-600">{n}</span><h3 className="mt-4 font-semibold text-slate-900">{t}</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">{d}</p></div>)}</div></div><div className="mt-14 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><Info className="mt-0.5 size-5 shrink-0" /><p><strong>Importante:</strong> el MVP trabaja únicamente con las señas incluidas en el vocabulario disponible. No es un traductor universal de oraciones completas.</p></div></section></div>
}

function ModeCard({ icon: Icon, title, description, action, accent, onClick }: { icon: typeof Camera; title: string; description: string; action: string; accent: 'blue'|'teal'; onClick: () => void }) { return <div className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60 sm:p-8"><div className={cn('flex size-12 items-center justify-center rounded-xl', accent === 'blue' ? 'bg-blue-50 text-blue-600' : 'bg-teal-50 text-teal-600')}><Icon className="size-6" /></div><h3 className="mt-6 text-xl font-bold text-slate-900">{title}</h3><p className="mt-2 max-w-md leading-7 text-slate-500">{description}</p><Button variant="outline" className="mt-6 border-slate-200" onClick={onClick}>{action}<ArrowRight data-icon="inline-end" /></Button></div> }

function TextToLsp() {
  type PasoVideo = { palabra: string; video: string }

  const [query, setQuery] = useState('')
  const [catalogo, setCatalogo] = useState<SenaCatalogo[]>([])
  const [catalogoCargando, setCatalogoCargando] = useState(true)
  const [secuencia, setSecuencia] = useState<PasoVideo[]>([])
  const [ausentes, setAusentes] = useState<string[]>([])
  const [indice, setIndice] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [velocidad, setVelocidad] = useState(1)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let activo = true
    listarSenas()
      .then((datos: SenaCatalogo[]) => { if (activo) setCatalogo(datos) })
      .catch((err: unknown) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo.')
      })
      .finally(() => { if (activo) setCatalogoCargando(false) })
    return () => { activo = false }
  }, [])

  function normalizar(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleUpperCase('es')
      .replace(/[^A-ZÑ0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  async function buscarOracion() {
    if (loading || catalogoCargando) return
    setError('')
    setSecuencia([])
    setAusentes([])
    setIndice(0)
    setVelocidad(1)
    const palabras = normalizar(query).split(' ').filter(Boolean)
    if (!palabras.length) {
      setError('Escribe una oración o una palabra para buscar.')
      return
    }
    setLoading(true)
    try {
      const disponibles = new Map<string, string>(
        catalogo.map((item: SenaCatalogo) => [normalizar(item.nombre.replace(/-/g, ' ')), item.nombre])
      )
      const glosas: string[] = []
      const sinCoincidencia: string[] = []
      let posicion = 0
      // Coincidencia de frase más larga antes de buscar cada palabra individual.
      while (posicion < palabras.length) {
        let nombre: string | undefined
        let largoEncontrado = 0
        for (let largo = palabras.length - posicion; largo >= 1; largo--) {
          const fragmento = palabras.slice(posicion, posicion + largo).join(' ')
          const candidato = disponibles.get(fragmento)
          if (candidato) { nombre = candidato; largoEncontrado = largo; break }
        }
        if (nombre) {
          glosas.push(nombre)
          posicion += largoEncontrado
        } else {
          sinCoincidencia.push(palabras[posicion])
          posicion++
        }
      }

      // Consultar únicamente las glosas existentes; preservamos el orden de entrada.
      const unicas = [...new Set(glosas)]
      const resultados = await Promise.allSettled(unicas.map((glosa) => buscarSena(glosa)))
      const videosPorGlosa = new Map<string, string>()
      resultados.forEach((respuesta, i) => {
        if (respuesta.status === 'fulfilled' && respuesta.value.videos.length > 0) {
          videosPorGlosa.set(unicas[i], respuesta.value.videos[0].url)
        }
      })
      const pasos: PasoVideo[] = []
      for (const glosa of glosas) {
        const url = videosPorGlosa.get(glosa)
        if (url) pasos.push({ palabra: glosa, video: url })
        else sinCoincidencia.push(glosa)
      }
      setSecuencia(pasos)
      setAusentes(sinCoincidencia)
      if (!pasos.length) setError('No se encontraron videos disponibles para este texto.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible consultar la oración.')
    } finally {
      setLoading(false)
    }
  }

  const cambiarIndice = (nuevo: number) => {
    setIndice(Math.max(0, Math.min(nuevo, secuencia.length - 1)))
  }
  const repetir = () => {
    const v = videoRef.current
    if (v) { v.currentTime = 0; void v.play().catch(() => {}) }
  }
  const cambiarVelocidad = () => {
    const nueva = velocidad === 1 ? 0.5 : 1
    setVelocidad(nueva)
    if (videoRef.current) videoRef.current.playbackRate = nueva
  }
  const actual = secuencia[indice]

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-12 lg:px-8">
      <PageIntro eyebrow="Texto → LSP" title="Convertir oraciones en secuencias de señas" description="Escribe una oración y consulta, en orden, las referencias disponibles en el dataset LSP." />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label htmlFor="texto-oracion" className="mb-3 block text-sm font-semibold text-slate-800">Texto en español</label>
        <textarea
          id="texto-oracion"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ejemplo: Hola amigo"
          rows={3}
          className="w-full resize-y rounded-xl border border-slate-200 bg-white p-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
        <Button onClick={() => void buscarOracion()} disabled={loading || catalogoCargando || !query.trim()} className="mt-4 bg-blue-600 hover:bg-blue-700">
          <Search data-icon="inline-start" />{catalogoCargando ? 'Cargando catálogo...' : loading ? 'Procesando...' : 'Consultar secuencia de señas'}
        </Button>
        <p className="mt-3 text-xs leading-5 text-amber-700"><Info className="mr-1 inline size-3.5" />Este prototipo enlaza videos según coincidencias con el catálogo; no realiza traducción gramatical de español a LSP.</p>
      </div>

      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}

      {actual && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-label="Secuencia visual encontrada">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-bold text-slate-900">Secuencia visual</h2><p className="mt-1 text-sm text-slate-500">Referencia {indice + 1} de {secuencia.length}: {actual.palabra}</p></div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">Videos del dataset</span>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {secuencia.map((paso, i) => (
              <button key={`${paso.palabra}-${i}`} type="button" onClick={() => cambiarIndice(i)} aria-current={i === indice ? 'step' : undefined} className={cn('rounded-lg px-3 py-2 text-sm font-medium', i === indice ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}>
                {paso.palabra}
              </button>
            ))}
          </div>
          <video
            key={`${indice}-${actual.video}`}
            ref={videoRef}
            src={actual.video}
            autoPlay
            playsInline
            controls
            preload="metadata"
            onLoadedMetadata={(e) => { e.currentTarget.playbackRate = velocidad }}
            onEnded={() => { if (indice < secuencia.length - 1) cambiarIndice(indice + 1) }}
            className="aspect-video w-full rounded-xl bg-slate-900 object-contain"
            aria-label={`Video de la seña ${actual.palabra}`}
          />
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => cambiarIndice(indice - 1)} disabled={indice === 0}>Anterior</Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={repetir}><RotateCcw data-icon="inline-start" />Repetir</Button>
              <Button variant="outline" onClick={cambiarVelocidad}>{velocidad === 1 ? '0.5×' : '1×'}</Button>
            </div>
            <Button onClick={() => cambiarIndice(indice + 1)} disabled={indice >= secuencia.length - 1}>Siguiente <ArrowRight data-icon="inline-end" /></Button>
          </div>
          <p className="mt-4 text-xs text-slate-500">La reproducción automática puede requerir interacción del usuario según el navegador. Se mantienen los controles del video.</p>
        </section>
      )}

      {ausentes.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 font-semibold text-amber-800"><AlertCircle className="size-4" />Sin video disponible</h3>
          <p className="mt-2 text-sm text-amber-700">{ausentes.join(', ')}</p>
        </div>
      )}
    </div>
  )
}

function Dictionary({
  initialWord,
  onWordConsumed
}: {
  initialWord?: string | null
  onWordConsumed?: () => void
}) {
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<SenaCatalogo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<ResultadoLSP | null>(null)
  const [videoIndex, setVideoIndex] = useState(0)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  useEffect(() => {
    let active = true
    listarSenas()
      .then((data) => {
        if (active) {
          setItems(data)
          if (initialWord) {
            setTerm(initialWord)
            void abrirSena(initialWord)
            onWordConsumed?.()
          }
        }
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Error al cargar el catálogo') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [initialWord])

  // Mostrar el catálogo real completo; una lista fija ocultaba casi todas las señas.
  const lista = items
    .filter(item => item.nombre.toLocaleLowerCase('es').includes(term.trim().toLocaleLowerCase('es')))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const pages = Math.max(1, Math.ceil(lista.length / 24))
  const currentPage = Math.min(page, pages - 1)
  const visibleItems = lista.slice(currentPage * 24, (currentPage + 1) * 24)

  async function abrirSena(palabra: string) {
    setDetailError('')
    setDetailLoading(true)
    setSelected(null)
    setVideoIndex(0)
    try {
      setSelected(await buscarSena(palabra))
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'No se pudo abrir el video')
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-12 lg:px-8">
      <PageIntro eyebrow="Catálogo visual" title="Diccionario de LSP" description="Explora las referencias de ambos datasets. El diccionario es más amplio que las 17 clases del reconocedor; sus etiquetas aún requieren revisión lingüística." />
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 size-4 text-slate-400" />
          <input value={term} onChange={e => { setTerm(e.target.value); setPage(0) }} placeholder="Buscar una seña" aria-label="Buscar en el diccionario" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
        </div>
      </div>
      <p role="status" className="mt-4 text-sm text-slate-500">{loading ? 'Cargando catálogo…' : `${lista.length} resultados de ${items.length} entradas del catálogo`}</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!loading && !error && <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map(item => <article key={item.nombre} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
          <div className="flex aspect-[1.6] items-center justify-center bg-slate-900"><Video className="size-12 text-blue-300" /></div>
          <div className="p-5">
            <h2 className="font-semibold text-slate-900">{item.nombre.replaceAll('-', ' ')}</h2>
            <p className="mt-1 text-sm text-slate-500">{item.cantidad_videos} video(s) disponibles</p>
            <Button variant="outline" className="mt-4 w-full" onClick={() => void abrirSena(item.nombre)}>Ver videos <ArrowRight data-icon="inline-end" /></Button>
          </div>
        </article>)}
      </div>}
      {!loading && !error && pages > 1 && <nav aria-label="Páginas del diccionario" className="mt-6 flex items-center justify-center gap-4">
        <Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</Button>
        <span className="text-sm text-slate-600">Página {currentPage + 1} de {pages}</span>
        <Button variant="outline" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Siguiente</Button>
      </nav>}
      {!loading && !error && lista.length === 0 && <p className="mt-6 rounded-xl border border-dashed p-8 text-center text-slate-500">No hay señas que coincidan. Modifica o borra la búsqueda.</p>}
      {(selected || detailLoading || detailError) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => { setSelected(null); setDetailError('') }}>
        <section role="dialog" aria-modal="true" aria-label="Video de la seña" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-7" onClick={e => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">{selected?.palabra || 'Referencia de LSP'}</h2>
            <Button variant="ghost" size="icon" aria-label="Cerrar" onClick={() => { setSelected(null); setDetailError('') }}><X /></Button>
          </div>
          {detailLoading && <p role="status">Cargando video…</p>}
          {detailError && <p role="alert" className="text-red-700">{detailError}</p>}
          {selected && <>
            <video key={selected.videos[videoIndex]?.url} src={selected.videos[videoIndex]?.url} controls playsInline preload="metadata" onError={() => setDetailError('No se pudo reproducir el video. Vuelve a abrir la referencia o prueba otro navegador.')} className="aspect-video w-full rounded-xl bg-slate-900 object-contain" />
            {(selected.videos[videoIndex]?.duration_seconds ?? 1) < 0.5 && <p className="mt-3 text-sm text-amber-700">El segmento original es muy breve. Se conserva sin ralentizarlo; su utilidad como referencia requiere revisión.</p>}
            {selected.videos.length > 1 && <div className="mt-3 flex flex-wrap gap-2">{selected.videos.map((video, i) => <Button key={video.url} size="sm" variant={videoIndex === i ? 'default' : 'outline'} onClick={() => { setDetailError(''); setVideoIndex(i) }}>{video.nombre}</Button>)}</div>}
            {selected.videos[videoIndex]?.fuente && <div className="mt-3 space-y-1 text-xs leading-5 text-slate-600">
              <p>{selected.videos[videoIndex].nombre} · Glosa original: {selected.videos[videoIndex].glosa_original}</p>
              <p>{selected.videos[videoIndex].credito}</p>
              <p><a className="underline" href={selected.videos[videoIndex].fuente} target="_blank" rel="noreferrer">Fuente del video</a> · <a className="underline" href={selected.videos[videoIndex].licencia_url} target="_blank" rel="noreferrer">{selected.videos[videoIndex].licencia}</a></p>
              <p>{selected.videos[videoIndex].cambios}</p>
            </div>}
            {selected.videos.length > 1 && <p className="mt-3 text-xs text-slate-500">Referencias agrupadas por coincidencia de etiqueta. La equivalencia entre fuentes aún no está validada.</p>}
            <p className="mt-4 text-sm text-amber-700">Referencia del catálogo. La etiqueta proviene del dataset y aún requiere revisión lingüística.</p>
          </>}
        </section>
      </div>}
    </div>
  )
}

function Admin() { return <div className="mx-auto max-w-[1200px] px-5 py-12 lg:px-8"><PageIntro eyebrow="Gestión del catálogo" title="Administración" description="Panel preparado para una futura autenticación. Registrar una seña no implica que el modelo de Machine Learning ya pueda reconocerla." /><div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><Settings className="size-4" /><span>Vista de demostración · La autenticación y persistencia se incorporarán en una siguiente fase.</span></div><div className="grid gap-5 sm:grid-cols-3"><Stat label="Señas registradas" value="48" icon={BookOpen} /><Stat label="Pendientes de validar" value="12" icon={Clock3} /><Stat label="Clases del modelo" value="30" icon={Sparkles} /></div><div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900">Catálogo de señas</h2><p className="mt-1 text-sm text-slate-500">Gestiona el contenido y su estado de validación.</p></div><Button className="bg-blue-600"><Plus data-icon="inline-start" />Registrar nueva seña</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3 font-medium">Palabra / glosa</th><th className="px-5 py-3 font-medium">Categoría</th><th className="px-5 py-3 font-medium">Referencia</th><th className="px-5 py-3 font-medium">Estado</th><th className="px-5 py-3 font-medium">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{dictionary.slice(0, 5).map((item, i) => <tr key={item.word}><td className="px-5 py-4 font-medium text-slate-800">{item.word}</td><td className="px-5 py-4 text-slate-500">{item.category}</td><td className="px-5 py-4 text-slate-500">{i < 3 ? 'Video' : 'Pendiente'}</td><td className="px-5 py-4"><span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', i < 3 ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700')}>{i < 3 ? 'Validada' : 'Por validar'}</span></td><td className="px-5 py-4"><button className="text-sm font-medium text-blue-600 hover:underline">Editar</button></td></tr>)}</tbody></table></div></div></div> }

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof BookOpen }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon className="size-5" /></span><span className="text-2xl font-bold text-slate-900">{value}</span></div><p className="mt-4 text-sm text-slate-500">{label}</p></div> }

function Help() { const faqs = [['¿Cómo activo la cámara?', 'En el Traductor LSP, presiona “Activar cámara” y acepta el permiso del navegador. La cámara solo funciona mientras la página está abierta.'],['¿Qué hago si no reconoce una seña?', 'Asegúrate de tener buena iluminación, las manos visibles y un fondo despejado. Recuerda que el MVP solo incluye un vocabulario limitado.'],['¿Puedo buscar cualquier palabra?', 'El diccionario contiene referencias de demostración para un conjunto acotado de expresiones. Si no encontramos una palabra, te mostraremos un aviso.'],['¿Se guardan mis imágenes?', 'No. El prototipo no almacena imágenes, videos ni capturas de los usuarios de forma persistente.']]; return <div className="mx-auto max-w-[900px] px-5 py-12 lg:px-8"><PageIntro eyebrow="Centro de ayuda" title="Estamos para ayudarte" description="Encuentra respuestas rápidas sobre el uso del prototipo y sus alcances." /><div className="grid gap-4">{faqs.map(([q,a]) => <details key={q} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-800"><span className="flex items-center gap-3"><CircleHelp className="size-5 text-blue-600" />{q}</span><ChevronDown className="size-4 text-slate-400 transition group-open:rotate-180" /></summary><p className="mt-4 max-w-2xl pl-8 text-sm leading-7 text-slate-500">{a}</p></details>)}</div><div className="mt-8 rounded-2xl bg-slate-900 p-6 text-white sm:p-8"><div className="flex gap-4"><ShieldCheck className="size-6 shrink-0 text-teal-300" /><div><h2 className="font-semibold">Privacidad y accesibilidad</h2><p className="mt-2 text-sm leading-7 text-slate-300">Este proyecto debe validarse posteriormente con usuarios reales de LSP. Diseñamos el flujo con foco en claridad, teclado, contraste y mensajes comprensibles.</p></div></div></div></div> }

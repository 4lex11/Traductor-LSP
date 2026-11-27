import { comparar, crearDetector, describir } from './comparacion.mjs'

const video = document.querySelector('#camara')
const activate = document.querySelector('#activar')
const compare = document.querySelector('#comparar')
const status = document.querySelector('#estado')
const videoResult = document.querySelector('#videos')
const photoResult = document.querySelector('#fotos')
let camera = null
let detectorPromise
let galleryPromise

function resetResults() {
  videoResult.textContent = photoResult.textContent = '—'
}

function stopCamera() {
  camera?.getTracks().forEach(track => track.stop())
  camera = null
  video.srcObject = null
  activate.textContent = 'Activar cámara'
  compare.disabled = true
  resetResults()
  status.textContent = 'Activa la cámara para comenzar.'
}

activate.addEventListener('click', async () => {
  if (camera) {
    stopCamera()
    return
  }
  activate.disabled = true
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camara no disponible')
    camera = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    })
    for (const track of camera.getVideoTracks()) track.addEventListener('ended', stopCamera, { once: true })
    video.srcObject = camera
    await video.play()
    activate.textContent = 'Apagar cámara'
    compare.disabled = false
    status.textContent = 'Coloca una mano en el encuadre.'
  } catch {
    stopCamera()
    status.textContent = 'No se pudo activar la cámara. Revisa los permisos de esta página.'
  } finally {
    activate.disabled = false
  }
})

compare.addEventListener('click', async () => {
  if (!camera) return
  const active = camera
  compare.disabled = true
  activate.disabled = true
  resetResults()
  status.textContent = 'Mantén la postura mientras se analiza la mano…'
  try {
    detectorPromise ??= crearDetector('/mediapipe', new URL('./vision.mjs', import.meta.url).href).catch(error => { detectorPromise = undefined; throw error })
    galleryPromise ??= Promise.all(['galeria-videos.json', 'galeria-fotos.json'].map(async name => {
      const response = await fetch(new URL(name, import.meta.url))
      if (!response.ok) throw new Error('Galería no disponible')
      return response.json()
    })).then(galleries => galleries.flat()).catch(error => { galleryPromise = undefined; throw error })
    const [detector, gallery] = await Promise.all([detectorPromise, galleryPromise])
    const poses = []
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 160))
      if (active !== camera) return
      if (video.readyState < 2) continue
      const frame = detector.detect(video)
      const pose = describir(frame.landmarks, video.videoWidth, video.videoHeight)
      if (pose) poses.push(pose)
    }
    if (poses.length < 2) {
      status.textContent = 'Captura insuficiente. Muestra una sola mano completa y vuelve a comparar.'
      return
    }
    const show = result => result.slice(0, 3).map(item => item.letra.toUpperCase()).join(' · ')
    videoResult.textContent = show(comparar(poses, gallery))
    photoResult.textContent = show(comparar(poses, gallery, true))
    status.textContent = 'Posibles coincidencias, ordenadas por similitud.'
  } catch {
    if (camera === active) status.textContent = 'No se pudo cargar la comparación. Vuelve a intentarlo.'
  } finally {
    compare.disabled = !camera
    activate.disabled = false
  }
})

window.addEventListener('pagehide', stopCamera)

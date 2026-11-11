/** Solicitar cámara al pulsar el botón, sin depender del servidor ni del modelo. */
export async function requestCamera(devices: Pick<MediaDevices, 'getUserMedia'> | undefined, secure: boolean) {
  if (!secure) throw new Error('La cámara requiere HTTPS. Abre https://traductor-lsp.vercel.app directamente en tu navegador.')
  if (!devices?.getUserMedia) throw new Error('Este navegador no permite acceder a la cámara. Abre la página directamente en un navegador actualizado, fuera de vistas incrustadas.')
  try {
    return await devices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: { ideal: 'user' } }, audio: false })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'OverconstrainedError') {
      return devices.getUserMedia({ video: true, audio: false })
    }
    throw error
  }
}

export function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'El acceso a la cámara está bloqueado. En los permisos del sitio, junto a la dirección web, permite Cámara y vuelve a intentarlo. Revisa también los permisos de cámara del sistema. Si abriste la página dentro de otra aplicación, ábrela directamente en el navegador.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No se encontró una cámara. Conecta o habilita la webcam y vuelve a pulsar «Activar cámara».'
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'No se pudo abrir la cámara. Cierra otras aplicaciones que la usen y comprueba que esté habilitada en el sistema; luego vuelve a intentarlo.'
  if (name === 'OverconstrainedError') return 'La cámara no admite la configuración solicitada. Prueba otra cámara o navegador.'
  return error instanceof Error ? error.message : 'No se pudo activar la cámara. Comprueba los permisos del navegador y del sistema.'
}

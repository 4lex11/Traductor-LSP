export const letras = [...'abcdeiou']

export async function crearDetector(base = '/mediapipe', modulo = '/vision.mjs') {
  const { FilesetResolver, HandLandmarker } = await import(modulo)
  const files = await FilesetResolver.forVisionTasks(base + '/wasm')
  return HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: base + '/hand_landmarker.task', delegate: 'CPU' },
    runningMode: 'IMAGE',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
  })
}

export function describir(hands, width, height) {
  if (hands.length === 0) return null
  const [hand, lower] = hands.slice().sort((a, b) => a[0].y - b[0].y)
  // Ignora una mano en reposo claramente por debajo de la que hace la letra.
  if (lower && lower[0].y - hand[0].y < 0.15) return null
  if (hand.length !== 21 || !hand.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return null
  const [wrist] = hand
  const aspect = height / width
  const palm = Math.hypot(hand[9].x - wrist.x, (hand[9].y - wrist.y) * aspect)
  if (!Number.isFinite(palm) || palm <= 1e-6) return null
  return hand.slice(1).flatMap(p => [(p.x - wrist.x) / palm, (p.y - wrist.y) * aspect / palm])
}

function distancia(query, reference) {
  let direct = 0
  let mirror = 0
  for (let i = 0; i < query.length; i += 2) {
    const vertical = (query[i + 1] - reference[i + 1]) ** 2
    direct += (query[i] - reference[i]) ** 2 + vertical
    mirror += (query[i] + reference[i]) ** 2 + vertical
  }
  return Math.min(direct, mirror) / query.length
}

export function comparar(poses, references, incluirFotos = false) {
  if (poses.length === 0) return []
  return letras.flatMap(letra => {
    const available = references.filter(ref => ref.letra === letra && (incluirFotos || ref.fuente === 'video'))
    if (!available.length) return []
    const distance = poses.reduce((sum, pose) =>
      sum + Math.min(...available.map(ref => distancia(pose, ref.pose))), 0) / poses.length
    return [{ letra, distancia: distance }]
  }).sort((a, b) => a.distancia - b.distancia)
}

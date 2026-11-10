import type { HolisticLandmarkerResult } from '@mediapipe/tasks-vision'

export const CONTRACT = 'holistic-hands-raw-v1' as const
export const EXTRACTOR_SHA = 'e2dab61191e2dcd0a15f943d8e3ed1dce13c82dfa597b9dd39f562975a50c3f8' as const
// Python Holistic usa 0,5 para supresión; JS usa 0,3 por defecto.
export const HOLISTIC_THRESHOLDS = {
  minFaceDetectionConfidence: 0.5, minFaceSuppressionThreshold: 0.5, minFacePresenceConfidence: 0.5,
  minPoseDetectionConfidence: 0.5, minPoseSuppressionThreshold: 0.5, minPosePresenceConfidence: 0.5,
  minHandLandmarksConfidence: 0.5,
}
export interface Capture {
  contract: typeof CONTRACT
  extractor_sha256: typeof EXTRACTOR_SHA
  landmarks: number[][]
  point_mask: boolean[][]
  timestamps_ms: number[]
  width: number
  height: number
}

// Misma lateralidad anatómica que pack_landmarks de Python; no reflejar la entrada.
export function packHands(result: HolisticLandmarkerResult) {
  const values = new Array<number>(126).fill(0)
  const mask = new Array<boolean>(42).fill(false)
  const groups = [result.leftHandLandmarks[0] ?? [], result.rightHandLandmarks[0] ?? []]
  groups.forEach((hand, side) => {
    if (hand.length !== 0 && hand.length !== 21) throw new Error('Formato de manos inesperado')
    hand.forEach((p, index) => {
      const xyz = [p.x, p.y, p.z]
      if (xyz.every(Number.isFinite)) {
        const slot = side * 21 + index
        mask[slot] = true
        xyz.forEach((v, axis) => { values[slot * 3 + axis] = v })
      }
    })
  })
  return { values, mask }
}

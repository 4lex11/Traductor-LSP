import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

const ARM_JOINTS = [11, 12, 13, 14, 15, 16] as const
const ARM_CONNECTIONS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]] as const
// Los puntos de pose 0, 7 y 8 corresponden a nariz y orejas.
const HEAD_POINTS = [0, 7, 8] as const
const HEAD_CONNECTIONS = [[7, 0], [0, 8]] as const

function isVisible(point: NormalizedLandmark | undefined): point is NormalizedLandmark {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.visibility >= 0.5
}

export function drawPoseOverlay(canvas: HTMLCanvasElement, pose: readonly NormalizedLandmark[], width: number, height: number) {
  if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
    canvas.width = width
    canvas.height = height
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const scale = Math.max(1, canvas.width / 640)
  ctx.lineCap = 'round'
  drawGroup(ctx, pose, ARM_JOINTS, ARM_CONNECTIONS, '#38bdf8', scale)
  drawGroup(ctx, pose, HEAD_POINTS, HEAD_CONNECTIONS, '#fbbf24', scale)
}

function drawGroup(ctx: CanvasRenderingContext2D, pose: readonly NormalizedLandmark[],
  joints: readonly number[], connections: readonly (readonly [number, number])[], color: string, scale: number) {
  const { width, height } = ctx.canvas
  ctx.beginPath()
  for (const [a, b] of connections) {
    const from = pose[a]
    const to = pose[b]
    if (!isVisible(from) || !isVisible(to)) continue
    ctx.moveTo(from.x * width, from.y * height)
    ctx.lineTo(to.x * width, to.y * height)
  }
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 6 * scale
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = 3 * scale
  ctx.stroke()

  for (const joint of joints) {
    const point = pose[joint]
    if (!isVisible(point)) continue
    ctx.beginPath()
    ctx.arc(point.x * width, point.y * height, 4 * scale, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = scale
    ctx.stroke()
  }
}

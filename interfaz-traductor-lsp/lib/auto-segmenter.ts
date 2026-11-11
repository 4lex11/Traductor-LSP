export interface HandFrame { values: number[]; mask: boolean[]; time: number }

/** Heurística experimental de movimiento/pausas; no identifica límites lingüísticos. */
export class AutoSegmenter {
  state: 'waiting' | 'capturing' | 'rest' = 'waiting'
  private previous: HandFrame | null = null
  private buffer: HandFrame[] = []
  private frames: HandFrame[] = []
  private moving = 0
  private lastMotion = 0
  private lastSeen = 0
  private restSince: number | null = null
  private cooldownUntil = 0

  resetAfterResult(now: number) {
    this.state = 'rest'
    this.previous = null
    this.buffer = []; this.frames = []; this.moving = 0
    this.restSince = null; this.cooldownUntil = now + 1200
  }

  push(frame: HandFrame): HandFrame[] | null {
    if (this.previous && frame.time <= this.previous.time) return null
    const visible = frame.mask.some(Boolean)
    let distance = 0, points = 0
    if (this.previous) {
      for (let i = 0; i < 42; i++) {
        if (frame.mask[i] && this.previous.mask[i]) {
          distance += Math.hypot(frame.values[i * 3] - this.previous.values[i * 3], frame.values[i * 3 + 1] - this.previous.values[i * 3 + 1])
          points++
        }
      }
    }
    const motion = visible && points > 0 && distance / points > 0.008
    this.previous = frame
    if (this.state === 'rest') {
      if (motion) this.restSince = null
      else this.restSince ??= frame.time
      if (frame.time >= this.cooldownUntil && this.restSince !== null && frame.time - this.restSince >= 700) {
        this.state = 'waiting'; this.buffer = []
      }
      return null
    }
    if (visible) this.lastSeen = frame.time
    if (motion) this.lastMotion = frame.time
    if (this.state === 'waiting') {
      this.buffer.push(frame); this.buffer = this.buffer.slice(-6)
      this.moving = motion ? this.moving + 1 : 0
      if (this.moving >= 2) {
        this.state = 'capturing'; this.frames = [...this.buffer]; this.buffer = []
      }
      return null
    }
    this.frames.push(frame)
    const elapsed = frame.time - this.frames[0].time
    if (frame.time - this.lastMotion >= 700 || frame.time - this.lastSeen >= 400 || elapsed >= 6000 || this.frames.length >= 90) {
      const clip = this.frames
      this.resetAfterResult(frame.time)
      const usable = clip.filter(f => f.mask.some(Boolean)).length
      return elapsed >= 500 && clip.length >= 6 && usable >= clip.length / 2 ? clip : null
    }
    return null
  }
}

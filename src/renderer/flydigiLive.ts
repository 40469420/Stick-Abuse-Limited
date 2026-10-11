/**
 * Live stick feed for pads without a decoded vendor input stream (Apex 5).
 * Uses the standard Gamepad API (XInput interface) — axes only, no protocol.
 */
import { useEffect, useState } from 'react'

export interface FlyLive {
  present: boolean
  lx: number
  ly: number
  rx: number
  ry: number
}

function pickPad(): (Gamepad & { connected: boolean }) | null {
  try {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []
    const live = pads.filter((p): p is Gamepad => !!p && p.connected && p.axes.length >= 4)
    if (live.length === 0) return null
    return live.find((p) => /37d7|2501|flydigi|apex/i.test(p.id)) ?? live[0]
  } catch {
    return null
  }
}

/** Polls at ~10 Hz while enabled. Values are -1..1 per axis. */
export function useFlyLive(enabled: boolean): FlyLive {
  const [state, setState] = useState<FlyLive>({ present: false, lx: 0, ly: 0, rx: 0, ry: 0 })
  useEffect(() => {
    if (!enabled) {
      setState({ present: false, lx: 0, ly: 0, rx: 0, ry: 0 })
      return
    }
    let dead = false
    const timer = window.setInterval(() => {
      if (dead) return
      const pad = pickPad()
      if (!pad) {
        setState((s) => (s.present ? { present: false, lx: 0, ly: 0, rx: 0, ry: 0 } : s))
        return
      }
      const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes
      setState({ present: true, lx, ly, rx, ry })
    }, 100)
    return () => {
      dead = true
      window.clearInterval(timer)
    }
  }, [enabled])
  return state
}

/** -1..1 axis → 0..255 StickCross/StickDial scale (centre 128). */
export function axisToByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round((v + 1) * 127.5)))
}

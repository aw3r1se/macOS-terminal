// macOS "genie" minimize, fitted to a 60fps screen recording of Terminal.app:
// ~0.37s in all. The sides follow an S-shaped funnel fixed on screen between the
// window's top and the Dock tile, which bends in over the first ~45%; from ~20%
// the window runs down it, the rows that reach the Dock piling into the tile,
// so the bottom disappears first and the top last.
//
// The window is cut into horizontal strips, each a copy of the window clipped to
// its band and mapped onto a quadrilateral of the funnel with a projective
// matrix3d, so the edges stay smooth with a few dozen strips.

export const GENIE_MS = 370
const BEND = 0.45 // time to bend the funnel fully in
const SLIDE_FROM = 0.2 // when the top of the window starts to move
const SETTLE_FROM = 0.85 // rows ease into their final place in the tile
// funnel narrowing, over the way from the window's top to the tile's top
const NECK_FROM = 0
const NECK_SPAN = 1
const STRIP = 8 // strip height in px

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (t) => t * t * (3 - 2 * t)
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/**
 * A static copy of the window as it looks now: scrollback above the visible
 * part is dropped (cheap to copy many times) and `place(copy)` restores the
 * scroll offset once a copy is in the document. `width`/`height` are the
 * window's size, for scaling the copy into a Dock tile.
 */
export function snapshot(el) {
  const copy = el.cloneNode(true)
  const screen = el.querySelector('.screen')
  let scrollTop = screen?.scrollTop ?? 0

  if (screen) {
    const lines = [...screen.querySelectorAll('.line')]
    const copies = [...copy.querySelector('.screen').querySelectorAll('.line')]
    lines.forEach((line, i) => {
      // only whole lines above the viewport, and only from the scrollback
      // (inside .page the min-height would absorb the removed height)
      if (line.parentElement !== screen) return
      if (line.offsetTop + line.offsetHeight <= screen.scrollTop) {
        scrollTop -= line.offsetHeight
        copies[i].remove()
      }
    })
  }

  copy.querySelectorAll('textarea').forEach((node) => node.remove())

  return {
    node: copy,
    width: el.offsetWidth,
    height: el.offsetHeight,
    place(node) {
      const s = node.querySelector('.screen')
      if (s) s.scrollTop = scrollTop
    },
  }
}

// Projective map of the w×h box onto the quad tl, tr, br, bl (Heckbert)
function quadMatrix(w, h, [x0, y0], [x1, y1], [x2, y2], [x3, y3]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  let g = 0, k = 0
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1
    g = (dx3 * dy2 - dx2 * dy3) / den
    k = (dx1 * dy3 - dx3 * dy1) / den
  }
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3
  const d = y1 - y0 + g * y1, e = y3 - y0 + k * y3
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${k / h},0,0,1,0,${x0},${y0},0,1)`
}

/**
 * Plays the genie between `from` (the window, viewport rect) and `to` (the Dock
 * thumbnail rect). `reverse` plays it back out of the Dock. Resolves when done.
 */
export function genie(shot, from, to, { reverse = false, duration = GENIE_MS } = {}) {
  const layer = document.createElement('div')
  layer.className = 'genie-layer'
  Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '2000', pointerEvents: 'none' })

  const { width: w, height: h } = from
  const count = Math.max(1, Math.ceil(h / STRIP))
  const sh = h / count
  const strips = []

  for (let i = 0; i < count; i++) {
    const strip = document.createElement('div')
    // +1px overlap hides seams between neighbouring strips
    Object.assign(strip.style, {
      position: 'absolute', left: '0', top: '0', width: `${w}px`, height: `${sh + 1}px`,
      overflow: 'hidden', transformOrigin: '0 0', willChange: 'transform',
    })
    const copy = shot.node.cloneNode(true)
    Object.assign(copy.style, {
      position: 'absolute', left: '0', top: `${-i * sh}px`, width: `${w}px`, height: `${h}px`,
      transform: 'none', transition: 'none', opacity: '1', boxShadow: 'none', visibility: 'visible',
    })
    strip.appendChild(copy)
    layer.appendChild(strip)
    strips.push(strip)
  }
  document.body.appendChild(layer)
  strips.forEach((strip) => shot.place(strip.firstChild))

  const funnel = (y) => smooth(clamp01(((y - from.top) / (to.top - from.top) - NECK_FROM) / NECK_SPAN))

  const frame = (p) => {
    const bend = easeInOut(clamp01(p / BEND))
    const t = clamp01((p - SLIDE_FROM) / (1 - SLIDE_FROM))
    const top = lerp(from.top, to.top, t * (1 + 0.3 * (1 - t)))
    const settle = easeInOut(clamp01((p - SETTLE_FROM) / (1 - SETTLE_FROM)))
    const rowY = (v) => {
      const free = top + v * h
      // past the tile's top the rows pile up inside it
      const piled = free <= to.top ? free : to.top + to.height * (1 - Math.exp((to.top - free) / to.height))
      return lerp(piled, to.top + v * to.height, settle)
    }
    const edge = (y) => {
      const k = funnel(y) * bend
      return [lerp(from.left, to.left, k), lerp(from.left + w, to.left + to.width, k)]
    }
    strips.forEach((strip, i) => {
      const y0 = rowY(i / count)
      const y1 = rowY(Math.min(1, (i + 1) / count + 1 / h))
      const [l0, r0] = edge(y0)
      const [l1, r1] = edge(y1)
      strip.style.transform = quadMatrix(w, sh + 1, [l0, y0], [r0, y0], [r1, y1], [l1, y1])
    })
  }

  return new Promise((resolve) => {
    const start = performance.now()
    const tick = (now) => {
      const t = clamp01((now - start) / duration)
      frame(reverse ? 1 - t : t)
      if (t < 1) requestAnimationFrame(tick)
      else {
        layer.remove()
        resolve()
      }
    }
    frame(reverse ? 1 : 0)
    requestAnimationFrame(tick)
  })
}

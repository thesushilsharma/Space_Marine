// Simulated WebAssembly physics engine
// In production, these functions would be imported from a compiled .wasm module

export const Physics = {
  integrate: (entities: Array<{x: number, y: number, vx: number, vy: number, av?: number, rot?: number}>, dt: number) => {
    for (const e of entities) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.av !== undefined && e.rot !== undefined) {
        e.rot += e.av * dt;
      }
    }
  },

  hit: (a: {x: number, y: number, r: number}, b: {x: number, y: number, r: number}, extra = 0) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy < (a.r + b.r + extra) * (a.r + b.r + extra);
  },

  wrap: (e: {x: number, y: number, r: number}, w: number, h: number) => {
    if (e.x < -e.r) e.x = w + e.r;
    else if (e.x > w + e.r) e.x = -e.r;
    if (e.y < -e.r) e.y = h + e.r;
    else if (e.y > h + e.r) e.y = -e.r;
  },

  thrust: (angle: number, force: number) => ({
    vx: Math.sin(angle) * force,
    vy: -Math.cos(angle) * force,
  }),

  clampSpeed: (e: {vx: number, vy: number}, max: number) => {
    const s = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    if (s > max) {
      e.vx = (e.vx / s) * max;
      e.vy = (e.vy / s) * max;
    }
  },

  dist: (a: {x: number, y: number}, b: {x: number, y: number}) => 
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2),

  angleTo: (a: {x: number, y: number}, b: {x: number, y: number}) => 
    Math.atan2(b.y - a.y, b.x - a.x),
};
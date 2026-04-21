/**
 * src/lib/physics.ts
 *
 * Physics engine for Space Marine / Asteroid Blaster.
 *
 * Architecture:
 *   1. Pure-TypeScript fallbacks are used immediately (synchronous, zero latency).
 *   2. On the client, physics.wasm is fetched and instantiated.
 *   3. After WASM loads, the hot-path functions are transparently hot-swapped:
 *      - hit / dist / angleTo / thrust / clampSpeed  → scalar WASM calls
 *      - integrate → batch_integrate (writes entity array to WASM linear
 *        memory via Float64Array, one WASM call for all N entities, reads back)
 *      - wrap      → batch_wrap (same pattern)
 *   Call-sites in GameCanvas.tsx remain unchanged.
 *
 * Building the WASM:
 *   pnpm install          # installs wabt
 *   node build-wasm.js    # physics.wat → public/physics.wasm
 */

// ── Entity type aliases ───────────────────────────────────────────────────────
type Vec2    = { x: number; y: number };
type Circle  = Vec2 & { r: number };
type Movable = Vec2 & { vx: number; vy: number; av?: number; rot?: number };

// ── Pure-TypeScript fallbacks ─────────────────────────────────────────────────

const _integrate = (entities: Movable[], dt: number) => {
  for (const e of entities) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (e.av !== undefined && e.rot !== undefined) e.rot += e.av * dt;
  }
};

const _hit = (a: Circle, b: Circle, extra = 0) => {
  const dx = a.x - b.x, dy = a.y - b.y;
  const sum = a.r + b.r + extra;
  return dx * dx + dy * dy < sum * sum;
};

const _wrap = (e: Circle, w: number, h: number) => {
  if      (e.x < -e.r)    e.x = w + e.r;
  else if (e.x > w + e.r) e.x = -e.r;
  if      (e.y < -e.r)    e.y = h + e.r;
  else if (e.y > h + e.r) e.y = -e.r;
};

const _thrust = (angle: number, force: number) => ({
  vx:  Math.sin(angle) * force,
  vy: -Math.cos(angle) * force,
});

const _clampSpeed = (e: { vx: number; vy: number }, max: number) => {
  const s = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
  if (s > max) { e.vx = (e.vx / s) * max; e.vy = (e.vy / s) * max; }
};

const _dist    = (a: Vec2, b: Vec2) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const _angleTo = (a: Vec2, b: Vec2) =>
  Math.atan2(b.y - a.y, b.x - a.x);

// ── Public Physics object ─────────────────────────────────────────────────────
// Starts with TS implementations; WASM hot-swaps them after loading.

export const Physics = {
  integrate:  _integrate,
  hit:        _hit,
  wrap:       _wrap,
  thrust:     _thrust,
  clampSpeed: _clampSpeed,
  dist:       _dist,
  angleTo:    _angleTo,
};

// ── WASM loader ───────────────────────────────────────────────────────────────

/**
 * Entity layout written to WASM linear memory (stride = 56 bytes = 7 × f64):
 *   index+0 = x,  index+1 = y,  index+2 = vx,  index+3 = vy,
 *   index+4 = rot, index+5 = av, index+6 = r
 * (Float64Array is indexed in f64 units, so entity i starts at index i*7)
 */
const ENTITY_STRIDE_F64 = 7; // 7 × 8 bytes = 56 bytes

async function loadStandaloneWasm(): Promise<void> {
  // sin/cos/atan2 must come from the host; sqrt uses the f64.sqrt WASM opcode.
  const importObject = {
    env: {
      sin:   (x: number)            => Math.sin(x),
      cos:   (x: number)            => Math.cos(x),
      atan2: (y: number, x: number) => Math.atan2(y, x),
    },
  };

  let wasm: WebAssembly.Exports;

  try {
    const res = await fetch("/physics.wasm");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let result: WebAssembly.WebAssemblyInstantiatedSource;
    try {
      // Streaming compile (fastest; needs correct MIME from server)
      result = await WebAssembly.instantiateStreaming(
        fetch("/physics.wasm"),
        importObject,
      );
    } catch {
      // Fallback for servers that send wrong MIME type
      const buf = await res.arrayBuffer();
      result = await WebAssembly.instantiate(buf, importObject);
    }
    wasm = result.instance.exports;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      "[Physics] physics.wasm not available — using TypeScript fallback.\n" +
      "  Build with: node build-wasm.js\n",
      msg,
    );
    return;
  }

  // ── Grab the exported linear memory ──────────────────────────────────────
  const memory = (wasm as any).memory as WebAssembly.Memory;

  // ── Hot-swap scalar helpers ───────────────────────────────────────────────

  Physics.hit = (a, b, extra = 0) =>
    !!(wasm as any).hit(a.x, a.y, a.r, b.x, b.y, b.r, extra);

  Physics.dist = (a, b) =>
    (wasm as any).dist(a.x, a.y, b.x, b.y) as number;

  Physics.angleTo = (a, b) =>
    (wasm as any).angleTo(a.x, a.y, b.x, b.y) as number;

  Physics.thrust = (angle, force) => ({
    vx: (wasm as any).thrustVx(angle, force) as number,
    vy: (wasm as any).thrustVy(angle, force) as number,
  });

  Physics.clampSpeed = (e, max) => {
    const factor = (wasm as any).clampFactor(e.vx, e.vy, max) as number;
    if (factor < 1.0) { e.vx *= factor; e.vy *= factor; }
  };

  // Scalar per-entity wrap (uses existing wrapCoord export)
  Physics.wrap = (e, w, h) => {
    e.x = (wasm as any).wrapCoord(e.x, e.r, w) as number;
    e.y = (wasm as any).wrapCoord(e.y, e.r, h) as number;
  };

  // ── Hot-swap BATCH integrate ──────────────────────────────────────────────
  // Writes all entity state into WASM linear memory, calls batch_integrate
  // once (single JS→WASM boundary crossing for the entire array), reads back.

  Physics.integrate = (entities: Movable[], dt: number) => {
    const n = entities.length;
    if (n === 0) return;

    // Float64Array view into WASM heap (re-created each call in case the
    // memory buffer was detached by a WASM memory.grow — cheap to create).
    const mem = new Float64Array(memory.buffer);

    // Write entity state to WASM memory at ptr=0
    for (let i = 0; i < n; i++) {
      const e = entities[i];
      const b = i * ENTITY_STRIDE_F64;
      mem[b    ] = e.x;
      mem[b + 1] = e.y;
      mem[b + 2] = e.vx;
      mem[b + 3] = e.vy;
      mem[b + 4] = e.rot ?? 0;
      mem[b + 5] = e.av  ?? 0;
      mem[b + 6] = (e as any).r ?? 0;
    }

    // Single call into WASM — all N entities integrated inside WASM
    (wasm as any).batch_integrate(0, n, dt);

    // Read back only the fields that changed (x, y, rot)
    for (let i = 0; i < n; i++) {
      const e = entities[i];
      const b = i * ENTITY_STRIDE_F64;
      e.x = mem[b];
      e.y = mem[b + 1];
      if (e.rot !== undefined) e.rot = mem[b + 4];
    }
  };

  console.info("[Physics] ✓ physics.wasm loaded — running WASM physics (batch integrate + scalar helpers).");
}

// ── Kick off WASM loading on the client only (no SSR) ────────────────────────
if (typeof window !== "undefined") {
  loadStandaloneWasm().catch(() => {
    // Silently stay with TypeScript fallback if anything goes wrong
  });
}
;; ─────────────────────────────────────────────────────────────
;;  physics.wat  —  Space Marine / Asteroid Blaster physics
;;  Compile: node build-wasm.js  →  public/physics.wasm
;; ─────────────────────────────────────────────────────────────
;;
;;  Scalar exports (f64 unless noted):
;;    hit(ax,ay,ar, bx,by,br, extra) → i32   circle-circle overlap
;;    dist(ax,ay, bx,by)             → f64   Euclidean distance
;;    angleTo(ax,ay, bx,by)          → f64   atan2 bearing (radians)
;;    thrustVx(angle,f)              → f64   sin(angle)*f
;;    thrustVy(angle,f)              → f64   −cos(angle)*f
;;    clampFactor(vx,vy,max)         → f64   speed-clamp multiplier
;;    wrapCoord(v,r,dim)             → f64   toroidal wrap (one axis)
;;
;;  Batch exports (operate on linear memory — zero copy):
;;    batch_integrate(ptr,count,dt)  Euler-integrate x,y,rot for N entities
;;    batch_wrap(ptr,count,w,h)      toroidal wrap on both axes for N entities
;;
;;  Entity layout in memory — stride 56 bytes (7 × f64):
;;    +0  x    +8  y    +16 vx   +24 vy   +32 rot  +40 av   +48 r
;;
;;  Host imports: sin / cos / atan2 from "env".
;;  sqrt is NOT imported — WASM's f64.sqrt opcode is used instead.
;; ─────────────────────────────────────────────────────────────

(module

  ;; ── Host math imports ────────────────────────────────────────
  (import "env" "sin"   (func $sin   (param f64)      (result f64)))
  (import "env" "cos"   (func $cos   (param f64)      (result f64)))
  (import "env" "atan2" (func $atan2 (param f64 f64)  (result f64)))

  ;; ── Linear memory (2 pages = 128 KB) ─────────────────────────
  ;; Supports ≈ 2300 entities @ 56 bytes each — ample for this game.
  (memory (export "memory") 2)


  ;; ═══════════════════════════════════════════════════════════════
  ;;  SCALAR HELPERS
  ;; ═══════════════════════════════════════════════════════════════

  ;; ── hit ──────────────────────────────────────────────────────
  (func $hit (export "hit")
    (param $ax f64)(param $ay f64)(param $ar f64)
    (param $bx f64)(param $by f64)(param $br f64)
    (param $extra f64)
    (result i32)
    (local $dx  f64)
    (local $dy  f64)
    (local $sum f64)

    (local.set $dx  (f64.sub (local.get $ax) (local.get $bx)))
    (local.set $dy  (f64.sub (local.get $ay) (local.get $by)))
    (local.set $sum
      (f64.add (f64.add (local.get $ar) (local.get $br)) (local.get $extra)))

    (f64.lt
      (f64.add (f64.mul (local.get $dx) (local.get $dx))
               (f64.mul (local.get $dy) (local.get $dy)))
      (f64.mul (local.get $sum) (local.get $sum)))
  )


  ;; ── dist ─────────────────────────────────────────────────────
  (func $dist (export "dist")
    (param $ax f64)(param $ay f64)
    (param $bx f64)(param $by f64)
    (result f64)

    (f64.sqrt
      (f64.add
        (f64.mul (f64.sub (local.get $ax) (local.get $bx))
                 (f64.sub (local.get $ax) (local.get $bx)))
        (f64.mul (f64.sub (local.get $ay) (local.get $by))
                 (f64.sub (local.get $ay) (local.get $by)))))
  )


  ;; ── angleTo ──────────────────────────────────────────────────
  (func $angleTo (export "angleTo")
    (param $ax f64)(param $ay f64)
    (param $bx f64)(param $by f64)
    (result f64)

    (call $atan2
      (f64.sub (local.get $by) (local.get $ay))
      (f64.sub (local.get $bx) (local.get $ax)))
  )


  ;; ── thrustVx ─────────────────────────────────────────────────
  (func $thrustVx (export "thrustVx")
    (param $angle f64)(param $f f64)
    (result f64)

    (f64.mul (call $sin (local.get $angle)) (local.get $f))
  )


  ;; ── thrustVy ─────────────────────────────────────────────────
  (func $thrustVy (export "thrustVy")
    (param $angle f64)(param $f f64)
    (result f64)

    (f64.neg (f64.mul (call $cos (local.get $angle)) (local.get $f)))
  )


  ;; ── clampFactor ──────────────────────────────────────────────
  (func $clampFactor (export "clampFactor")
    (param $vx f64)(param $vy f64)(param $max f64)
    (result f64)
    (local $s f64)

    (local.set $s
      (f64.sqrt
        (f64.add (f64.mul (local.get $vx) (local.get $vx))
                 (f64.mul (local.get $vy) (local.get $vy)))))

    (if (result f64) (f64.gt (local.get $s) (local.get $max))
      (then (f64.div (local.get $max) (local.get $s)))
      (else (f64.const 1.0))
    )
  )


  ;; ── wrapCoord ────────────────────────────────────────────────
  (func $wrapCoord (export "wrapCoord")
    (param $v f64)(param $r f64)(param $dim f64)
    (result f64)

    (if (result f64) (f64.lt (local.get $v) (f64.neg (local.get $r)))
      (then (f64.add (local.get $dim) (local.get $r)))
      (else
        (if (result f64)
          (f64.gt (local.get $v) (f64.add (local.get $dim) (local.get $r)))
          (then (f64.neg (local.get $r)))
          (else (local.get $v))
        )
      )
    )
  )


  ;; ═══════════════════════════════════════════════════════════════
  ;;  BATCH HELPERS  (read/write linear memory; no host callbacks)
  ;;
  ;;  Entity memory layout — stride = 56 bytes / 7 × f64:
  ;;    byte +0  : x      byte +8  : y
  ;;    byte +16 : vx     byte +24 : vy
  ;;    byte +32 : rot    byte +40 : av
  ;;    byte +48 : r
  ;; ═══════════════════════════════════════════════════════════════

  ;; ── batch_integrate ──────────────────────────────────────────
  ;; Euler-integrates position (and rotation) for `count` entities
  ;; starting at memory byte-offset `ptr`.
  ;;   x   += vx * dt
  ;;   y   += vy * dt
  ;;   rot += av * dt
  (func $batch_integrate (export "batch_integrate")
    (param $ptr   i32)
    (param $count i32)
    (param $dt    f64)
    (local $i    i32)
    (local $base i32)

    (local.set $i (i32.const 0))
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $count)))

        ;; base = ptr + i * 56
        (local.set $base
          (i32.add (local.get $ptr)
                   (i32.mul (local.get $i) (i32.const 56))))

        ;; x += vx * dt
        (f64.store (local.get $base)
          (f64.add
            (f64.load (local.get $base))
            (f64.mul
              (f64.load (i32.add (local.get $base) (i32.const 16)))
              (local.get $dt))))

        ;; y += vy * dt
        (f64.store (i32.add (local.get $base) (i32.const 8))
          (f64.add
            (f64.load (i32.add (local.get $base) (i32.const 8)))
            (f64.mul
              (f64.load (i32.add (local.get $base) (i32.const 24)))
              (local.get $dt))))

        ;; rot += av * dt
        (f64.store (i32.add (local.get $base) (i32.const 32))
          (f64.add
            (f64.load (i32.add (local.get $base) (i32.const 32)))
            (f64.mul
              (f64.load (i32.add (local.get $base) (i32.const 40)))
              (local.get $dt))))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
  )


  ;; ── batch_wrap ───────────────────────────────────────────────
  ;; Toroidal edge-wrap on both axes for `count` entities.
  (func $batch_wrap (export "batch_wrap")
    (param $ptr   i32)
    (param $count i32)
    (param $w     f64)
    (param $h     f64)
    (local $i    i32)
    (local $base i32)
    (local $v    f64)
    (local $r    f64)

    (local.set $i (i32.const 0))
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $count)))

        (local.set $base
          (i32.add (local.get $ptr)
                   (i32.mul (local.get $i) (i32.const 56))))

        ;; r at base+48
        (local.set $r
          (f64.load (i32.add (local.get $base) (i32.const 48))))

        ;; ── wrap x (base+0) ─────────────────────────────────
        (local.set $v (f64.load (local.get $base)))
        (if (f64.lt (local.get $v) (f64.neg (local.get $r)))
          (then
            (f64.store (local.get $base)
              (f64.add (local.get $w) (local.get $r))))
          (else
            (if (f64.gt (local.get $v)
                        (f64.add (local.get $w) (local.get $r)))
              (then
                (f64.store (local.get $base)
                  (f64.neg (local.get $r)))))))

        ;; ── wrap y (base+8) ─────────────────────────────────
        (local.set $v
          (f64.load (i32.add (local.get $base) (i32.const 8))))
        (if (f64.lt (local.get $v) (f64.neg (local.get $r)))
          (then
            (f64.store (i32.add (local.get $base) (i32.const 8))
              (f64.add (local.get $h) (local.get $r))))
          (else
            (if (f64.gt (local.get $v)
                        (f64.add (local.get $h) (local.get $r)))
              (then
                (f64.store (i32.add (local.get $base) (i32.const 8))
                  (f64.neg (local.get $r)))))))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
  )

)

# Space Marine
A polished, wave-based space shooter built with PixiJS & simulated WASM physics.

---

## 🎮 Controls
| Action | Keyboard | Mobile |
|--------|----------|--------|
| Rotate / Thrust | `WASD` or `Arrow Keys` | Drag bottom-left zone |
| Shoot | `Space`, `Click`, or `Z` | Tap anywhere to aim & fire |
| Strafe | `[` / `]` | N/A |
| Boost Dash | `Shift` | Double-tap movement zone |
| Smart Bomb | `B` | Tap bomb icon (if equipped) |

---

## 🛠️ Tech Stack & Architecture
- **Rendering:** PixiJS 8 (WebGL batched sprites, custom shaders for effects)
- **Physics:** `PhysicsEngine` module mimicking WASM exports (`step()`, `detectCollisions()`, `wrapEdges()`)
- **State Management:** Immutable entity pools, event-driven updates, deterministic fixed-timestep loop (`60Hz`)
- **Framework & Routing:** Next.js 16 (App Router) for optimised client-side rendering, fast HMR, and seamless deployment

---

## Deployment

You can deploy this application to a production server using a platform like Vercel, Netlify or any of your choice.

---

## Contributing

Feel free to fork the repository and submit pull requests with your improvements or bug fixes. We welcome contributions from the community!

---

## Known Issues

- None

---

## 🚀 Future Improvements

### Gameplay & Content
- **True WASM Physics** — Replace the JS-simulated `PhysicsEngine` with a compiled C/Rust WASM module (`physics.wat` → `.wasm`) for deterministic, near-native collision resolution and edge-wrapping at scale.
- **Additional Enemy Types** — Introduce new archetypes beyond `scout` and `gunship` (e.g., *Carrier*, *Stealth Drone*, *Siege Walker*) with distinct AI behaviour trees and attack patterns.
- **Boss Phase System** — Expand `Boss` with multi-phase transitions (teleport, shield-pulse, split form) triggered at HP thresholds, rewarding strategic play.
- **Expanded Powerup Pool** — Add timed shield regeneration, spread-shot, homing missiles, and time-slow powerups to the existing `PU_TYPES` pool.
- **Procedural Level Generation** — Dynamically scale asteroid density, enemy spawn rates, and formation patterns based on wave number for near-infinite replayability.
- **Smart Bomb Visual Polish** — Add a full-screen shockwave shader and screen-shake via a custom PixiJS filter when the smart bomb detonates.

### Technical & Performance
- **Spatial Hashing / Quad-tree Collision** — Replace brute-force O(n²) collision checks with a spatial hash grid to sustain 60 Hz at entity counts > 500.
- **WebGPU Renderer** — Gate on `navigator.gpu` and fall back to WebGL; expose a setting toggle so users on capable hardware benefit from reduced CPU overhead.
- **Worker-thread Game Loop** — Offload the physics `step()` and entity updates to a `SharedArrayBuffer`-backed Web Worker, keeping the main thread free for rendering.
- **Asset Bundling & Caching** — Integrate PixiJS `Assets` bundles with a service worker cache strategy for instant subsequent loads and offline play.
- **Replay System** — Record a deterministic input log each game session and allow players to replay or share runs via URL-encoded snapshots.

### UX & Accessibility
- **Persistent Leaderboard** — Store high scores in a lightweight backend (e.g., Vercel KV / Supabase) and display a global or friend-scoped top-10 board.
- **Settings Panel** — Expose volume sliders, graphics quality presets (resolution scale, particle count), and key-rebinding through an in-game settings modal.
- **Full Mobile Controller Support** — Implement on-screen virtual joystick for movement and a dedicated fire button for a first-class mobile experience.
- **Accessibility (A11y)** — Add screen-reader announcements for wave start/end, score changes, and game-over events using PixiJS's `AccessibilitySystem`.
- **Localisation (i18n)** — Externalise all HUD strings and support multiple languages via `next-intl` or a lightweight JSON locale map.

### Audio & Polish
- **Sound Engine** — Integrate the Web Audio API (or `Howler.js`) for dynamic SFX: engine thrust hum that scales with speed, layered explosion bursts, and a pulsing boss-encounter soundtrack.
- **Screenshake & Hit-stop** — Add a brief camera-shake filter on large impacts and a one-frame hit-stop pause on boss hits for satisfying game-feel.
- **Animated Nebula Background** — Replace the static ellipse nebula with a scrolling, parallax star-field driven by `TilingSprite` or a custom GLSL shader for depth.

### Developer Experience
- **Remove `window` Globals** — Replace `window.startGame`, `window.startNextWave`, and `window.buyUpgrade` with a React context or `useImperativeHandle` ref to avoid polluting the global scope and improve testability.
- **Type-safe Particle Pool** — Eliminate the `as any` casts on `PIXI.Particle` by extending the type with `vx`, `vy`, `life`, `maxLife`, and `baseScale` properties via declaration merging or a wrapper class.
- **Minimap as a React Component** — Lift the raw `<canvas>` minimap out of the PixiJS ticker and render it as a standalone React component that reads entity positions via a shared ref, improving separation of concerns.
- **Storybook for Game UI** — Isolate and visually test HUD components (score counter, wave banner, health bar, minimap) independently of the live game loop.
- **Performance Profiling Dashboard** — Surface PixiJS `Ticker` `deltaMS`, draw-call count, and `renderer.textureGC` stats in an in-dev overlay (toggled via `?debug=1`).

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

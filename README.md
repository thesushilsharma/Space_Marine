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

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

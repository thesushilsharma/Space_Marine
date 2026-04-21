/**
 * build-wasm.js
 *
 * Compiles physics.wat → public/physics.wasm using the `wabt` npm package.
 *
 * Usage:
 *   pnpm install          # installs wabt (one-time)
 *   node build-wasm.js    # outputs public/physics.wasm
 */

const fs   = require('fs');
const path = require('path');

async function main() {
  const wabt = await require('wabt')();

  const watPath  = path.resolve(__dirname, 'physics.wat');
  const wasmPath = path.resolve(__dirname, 'public', 'physics.wasm');

  // Ensure public/ directory exists
  const publicDir = path.resolve(__dirname, 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const watSource = fs.readFileSync(watPath, 'utf8');

  console.log('[build-wasm] Parsing physics.wat …');

  const module = wabt.parseWat('physics.wat', watSource, {
    mutable_globals:   true,
    sat_float_to_int:  true,
    sign_extension:    true,
    bulk_memory:       false,
    reference_types:   false,
    multi_value:       false,
    tail_call:         false,
    simd:              false,
    exceptions:        false,
    memory64:          false,
    extended_const:    false,
    gc:                false,
    relaxed_simd:      false,
    threads:           false,
  });

  module.validate();

  const { buffer } = module.toBinary({
    log:               false,
    canonicalize_lebs: true,
    relocatable:       false,
    write_debug_names: false,
  });

  fs.writeFileSync(wasmPath, Buffer.from(buffer));

  const kb = (buffer.byteLength / 1024).toFixed(2);
  console.log(`[build-wasm] ✓  public/physics.wasm written  (${kb} KB)`);

  module.destroy();
}

main().catch(err => {
  console.error('[build-wasm] FAILED:', err.message);
  process.exit(1);
});

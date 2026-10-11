// Same-origin module worker shim for the DWG parser.
// Keeping Worker() on the app origin avoids browser restrictions on cross-origin workers.
import 'https://cdn.jsdelivr.net/npm/@flyfish-dev/cad-viewer@0.8.0/dist/wasm/dwg-worker.js';

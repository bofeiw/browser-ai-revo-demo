/** Simple footer reinforcing the privacy / local-inference angle. */
export function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <p className="text-xs text-gray-500">
          Everything runs locally in your browser via WebGPU and WebAssembly. No
          backend, no cloud inference, no external AI APIs.
        </p>
      </div>
    </footer>
  )
}

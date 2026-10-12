# Practical Browser AI

**5 practical AI features. No backend. No cloud. Just your browser.**

A React + TypeScript application that demonstrates five practical use cases for
local, in-browser AI. Each feature is designed to eventually run entirely on the
client using browser-compatible models through technologies such as
[Transformers.js](https://huggingface.co/docs/transformers.js), **WebGPU**, and
**WebAssembly**.

> There is no AI backend, cloud inference, or external AI API. Everything is
> intended to run on-device.

## Features

| Tab | What it does |
| --- | --- |
| **Screenshot Bug Reporter** ✅ | Upload a screenshot and generate a structured bug report with a local vision-language model. |
| **AI Accessibility** ✅ | Upload an image and generate suggested alt text with a local image-captioning model. |
| **Smart Ticket Creator** | Convert unstructured natural language into a structured issue ticket. |
| **Pause & Ask** | Analyze a live camera feed, pause on a frame, and ask questions about its content. |
| **Semantic Search** | Search through local documents using semantic similarity. |

> **Status:** The **Screenshot Bug Reporter** and **AI Accessibility** tabs are
> fully implemented and run real in-browser inference. The remaining three tabs
> are still clearly labeled placeholders and will be implemented in later
> iterations.

See [Screenshot Bug Reporter](#screenshot-bug-reporter-1) and
[AI Accessibility](#ai-accessibility--local-alt-text-generator) below for each
feature's model, runtime, requirements, and known limitations.

## Tech stack

- [React 19](https://react.dev/) with TypeScript
- [Vite](https://vite.dev/) for dev server and builds
- [React Router v7](https://reactrouter.com/) for routing (lazy-loaded routes)
- [Tailwind CSS v4](https://tailwindcss.com/) for styling
- [Lucide React](https://lucide.dev/) for icons
- [Transformers.js v4](https://huggingface.co/docs/transformers.js) (`@huggingface/transformers`) for in-browser, WebGPU-accelerated model inference

## Getting started

Requires [Node.js](https://nodejs.org/) (18.18+ recommended) and npm.

```bash
# Install dependencies
npm install

# Start the dev server (http://localhost:5173)
npm run dev

# Type-check and build for production
npm run build

# Preview the production build locally
npm run preview
```

## Screenshot Bug Reporter

Upload a screenshot of a web UI, optionally add a sentence of context (e.g.
_"The Save button doesn't work"_), and a local vision-language model drafts a
structured bug report: title, observable description, visible error text,
affected UI elements, a suggested severity, and the information still missing to
investigate. Every field is editable, and the report can be copied as Markdown.

**Nothing leaves the device.** The model is downloaded from the Hugging Face Hub
once (then cached by the browser) and all inference runs locally via WebGPU.

### Model and runtime

| | |
| --- | --- |
| **Model** | [`HuggingFaceTB/SmolVLM-Instruct`](https://huggingface.co/HuggingFaceTB/SmolVLM-Instruct) — a 2.2B-parameter instruction-tuned vision-language model (Idefics3 architecture, SmolLM2-1.7B language backbone, SigLIP-SO400M vision encoder). |
| **Runtime** | [Transformers.js v4](https://huggingface.co/blog/transformersjs-v4) (`@huggingface/transformers`), which runs ONNX models in the browser. |
| **Acceleration** | **WebGPU** when available, with a WebAssembly (CPU) fallback. |
| **Quantization** | Per-submodel 4-bit: `q4f16` on WebGPU, `q4` on the CPU/WASM fallback (f16 is poorly supported on CPU). |

### Why this model?

The task is **visual question answering** — reading a screenshot and following a
free-form instruction — not fixed-task image captioning. That distinction drove
the choice:

- **SmolVLM-500M-Instruct is a genuine instruction-following VLM.** It accepts
  arbitrary interleaved image + text and produces free-form text, so it can be
  asked to describe a UI, read visible error text, and fill in a report
  template.
- **Florence-2 was evaluated and rejected.** Despite being a capable, small
  vision model, Florence-2 only responds to a fixed set of task prompts
  (`<CAPTION>`, `<OCR>`, `<OD>`, grounding, etc.) and is **not** an
  instruction-following model — it cannot be asked an arbitrary question about
  an image. See the [Florence-2 paper](https://arxiv.org/abs/2311.06242).
- **2.2B over the 256M/500M siblings.** The smaller SmolVLM checkpoints were
  tried first (they download in ~400 MB) but could not reliably read fine UI
  text — on a realistic form screenshot they missed a prominent red validation
  error and hallucinated UI elements. The 2.2B model uses the full
  SigLIP-SO400M vision encoder and the 1.7B SmolLM2 backbone, which the
  [SmolVLM paper](https://arxiv.org/abs/2504.05299) reports "rivals
  state-of-the-art VLMs consuming twice the GPU memory." That extra capacity is
  what the task needs.
- **Why not Qwen2-VL-2B?** Qwen2-VL has excellent OCR, but its ONNX vision
  encoder does not quantize (the weights stay ~2.6 GB), pushing the total
  download to ~4.5 GB — impractical for a browser demo. SmolVLM-Instruct's
  encoder quantizes cleanly, keeping it to ~1.4 GB.
- **It has a documented, working browser implementation** (the official SmolVLM
  WebGPU demo spaces and the `smolvlm-webgpu` example in
  [transformers.js-examples](https://github.com/huggingface/transformers.js-examples)),
  which this feature's worker is based on.

### Approximate download size

With `q4f16` quantization, the first analysis downloads roughly **~1.4 GB** of
model weights (decoder ≈ 965 MB, vision encoder ≈ 248 MB, token embeddings
≈ 201 MB, plus tokenizer/config). Files are cached by the browser, so subsequent
visits and analyses reuse them with no re-download.

### Browser and hardware requirements

- A **WebGPU-capable desktop browser** is strongly recommended — recent Chrome,
  Edge, or other Chromium-based browsers. Check [WebGPU support](https://caniuse.com/webgpu).
- A reasonably capable GPU with roughly **2–3 GB of free VRAM** for the model
  plus runtime buffers.
- Without WebGPU the feature falls back to the CPU (WASM) backend with `q4`
  weights, which is **significantly slower** and needs enough free RAM; on
  low-memory machines it may be impractical.
- A reasonably fast connection for the one-time ~1.4 GB model download.

### Known limitations

- **The report is a draft, not a verdict.** A screenshot does not prove a bug
  exists. The report is assembled from what the model observes in the image;
  severity stays "Unknown" and the "missing information" field always lists what
  a human still needs to establish. It is a compact on-device model and can make
  mistakes — **always review before filing.**
- **Why a multi-step approach?** Small VLMs reliably fail when asked to emit one
  large JSON object: they hallucinate and fall into token-repetition loops.
  Instead the feature asks a few short, focused questions (describe the screen,
  any visible error text, which UI elements) and builds the structured report in
  code. Generation also uses `no_repeat_ngram_size` to prevent repetition loops.
- Small VLMs can misread fine text; treat extracted error messages as
  best-effort, and correct them in the editable fields.
- First run is slow because of the model download and WebGPU shader
  compilation; later runs reuse the loaded model.
- No remote/cloud fallback exists by design. If local inference can't run, the
  feature reports an error instead of silently calling an API.

### How it's built (architecture)

The feature is split into focused modules under
`src/features/screenshot-bug-reporter/`:

```text
worker.ts          # Model init + multi-step inference + report assembly (Web Worker)
useBugReporter.ts  # React hook: owns the worker lifecycle and exposes state/actions
image.ts           # Image validation + downscaling + object-URL cleanup
prompt.ts          # The short, focused questions put to the model
formatReport.ts    # Serialize a report to Markdown for the clipboard
types.ts           # BugReport, Severity, and the worker message protocol
components/         # Dropzone, ModelStatus (download progress), ReportEditor
```

The model is loaded lazily on the first analysis, runs in a Web Worker to keep
the UI responsive, and is reused across subsequent analyses. The report is
assembled deterministically in code from the model's short per-question answers
(no large-JSON parsing, no extra schema dependency).

## AI Accessibility — Local Alt Text Generator

Upload an image (PNG, JPEG, or WebP), pick how much detail you want, and a local
image-captioning model suggests alternative text for it. The suggestion lands in
an editable textarea with a live character count and a copy button, so you can
refine it before using it. An optional **Image context** field lets you note how
the image is used on your site.

**Nothing leaves the device.** The model is downloaded from the Hugging Face Hub
once (then cached by the browser) and all captioning runs locally via WebGPU.
Image pixels are only ever read in your browser and in the Web Worker — they are
never uploaded.

### Model and runtime

| | |
| --- | --- |
| **Model** | [`onnx-community/Florence-2-base-ft`](https://huggingface.co/onnx-community/Florence-2-base-ft) — Microsoft's [Florence-2-base-ft](https://huggingface.co/microsoft/Florence-2-base-ft), a ~0.23B-parameter vision foundation model (MIT license), converted to ONNX for Transformers.js. |
| **Task** | **Image captioning** via Florence-2's `<CAPTION>`, `<DETAILED_CAPTION>`, and `<MORE_DETAILED_CAPTION>` task tokens (mapped to the Concise / Detailed / Rich options in the UI). |
| **Runtime** | [Transformers.js v4](https://huggingface.co/blog/transformersjs-v4) (`@huggingface/transformers`), which runs ONNX models in the browser. |
| **Acceleration** | **WebGPU** when available, with a WebAssembly (CPU) fallback. |
| **Quantization** | Mixed precision from the official example: `fp16` vision encoder + token embeddings on WebGPU (when the adapter supports `shader-f16`, else `fp32`); the encoder/decoder stay `q4`. On the CPU/WASM fallback everything drops to `fp32`/`q4`. |

### Why this model?

Alt text is fundamentally an **image-captioning** task — turn pixels into a short
visual description — not visual question answering. That drove a different choice
than the Bug Reporter's SmolVLM:

- **Florence-2 is purpose-built for captioning.** Its dedicated caption tasks
  produce clean, descriptive sentences out of the box, which is exactly the
  shape of good alt text. The three detail levels map directly to its three
  caption task tokens.
- **It's small and reliable.** At ~0.23B parameters, Florence-2-base downloads in
  a few hundred MB — far lighter than a 2.2B instruction VLM — which fits the
  brief of "the most reliable option, not the largest."
- **It has a documented, working browser implementation.** The feature's worker
  is based directly on the official
  [`florence2-webgpu`](https://github.com/huggingface/transformers.js-examples/tree/main/florence2-webgpu)
  example and the [Xenova/florence2-webgpu](https://huggingface.co/spaces/Xenova/florence2-webgpu)
  demo Space, including the exact mixed-precision `dtype` map and the shader
  warm-up pass.

### Honest note on the "Image context" field

Florence-2 is a **task-prompted captioning model, not an instruction-following
VLM**. Its model card only documents a fixed set of task tokens — it cannot be
given a free-form instruction like _"describe this as a product photo"_ and have
that steer the generated caption. The
[Florence-2 paper](https://arxiv.org/abs/2311.06242) describes exactly this
prompt-based, fixed-task design.

So this feature **does not** feed your context to the model and pretend it was
understood. Instead:

1. The model produces a plain visual caption from the pixels only.
2. That caption is cleaned in code into alt-text-appropriate phrasing (collapse
   whitespace, strip redundant _"Image of…" / "A picture of…"_ openers per the
   [W3C WAI images tutorial](https://www.w3.org/WAI/tutorials/images/), normalize
   capitalization and the trailing period).
3. Your optional context is folded in **transparently, in code** as a
   human-facing purpose hint appended to the suggestion — it never changes what
   the model detected. The UI says so plainly, and you're expected to edit the
   final text.

This keeps the model output honest and the editing workflow transparent, rather
than fabricating context-aware AI capabilities.

### Approximate download size

The first generation downloads roughly **~350–450 MB** of model weights with the
mixed `fp16`/`q4` precision above (fp16 vision encoder + token embeddings, q4
encoder/decoder, plus tokenizer/processor config). Exact totals vary with whether
the adapter supports `shader-f16` (fp16 vs. the larger fp32 submodels). Files are
cached by the browser, so later visits and generations reuse them with no
re-download.

### Browser and hardware requirements

- A **WebGPU-capable desktop browser** is strongly recommended — recent Chrome,
  Edge, or other Chromium-based browsers. Check [WebGPU support](https://caniuse.com/webgpu).
- A GPU with roughly **1–2 GB of free VRAM** for the model plus runtime buffers.
- Without WebGPU the feature falls back to the CPU (WASM) backend, which is
  **significantly slower** but still fully local.
- A reasonably fast connection for the one-time model download.

### Known limitations

- **Alt text is a draft, not a verdict — always have a human review it.** The
  model describes pixels; it does not know an image's *purpose* on your page,
  and appropriate alt text depends on that purpose (a decorative image may even
  warrant empty alt text). It can also miss, misread, or invent details. Treat
  every suggestion as a starting point and edit before publishing.
- **The context field is a post-processing hint, not AI understanding** (see the
  honest note above).
- A small captioning model can struggle with text in images, fine detail,
  uncommon subjects, and charts/diagrams.
- It will not reliably read or transcribe long passages of text in an image —
  that's OCR, a different task.
- No remote/cloud fallback exists by design. If local inference can't run, the
  feature reports an error instead of silently calling an API.

### Why AI-generated alt text still needs human review

Good alt text answers _"what does a sighted user get from this image, here, for
this purpose?"_ — not just _"what is in the picture?"_. The same photo needs
different alt text as a decorative banner, a linked thumbnail, or a data chart,
and only a human who knows the page context can make that call. A captioning
model has no access to that context and can also be confidently wrong about what
it sees. Shipping unreviewed machine captions risks misleading the very users
alt text is meant to serve, so this feature is explicitly a drafting aid with a
human in the loop.

### How it's built (architecture)

The feature is split into focused modules under
`src/features/ai-accessibility/`:

```text
worker.ts         # Model init + lazy load + Florence-2 caption generation (Web Worker)
useAltText.ts     # React hook: owns the worker lifecycle and exposes state/actions
image.ts          # Image validation + downscaling + object-URL cleanup
altText.ts        # Caption cleanup + transparent context hint + character count
types.ts          # Caption-detail levels and the worker message protocol
components/        # Dropzone, ModelStatus (download progress), AltTextResult (editor)
```

The model is loaded lazily on the first generation, runs in a Web Worker to keep
the UI responsive, and is reused across subsequent images. The worker caches the
preprocessed vision inputs per image, so switching the detail level or
regenerating doesn't re-encode the same pixels. It is a separate worker and model
from the Screenshot Bug Reporter — each feature downloads its own model only when
its route is visited, so an unrelated tab never pulls weights it doesn't need.

## Project structure

```text
src/
  components/
    layout/      # RootLayout (shell + Outlet), Header, Tabs (NavLink), Footer, NotFound
    ui/          # Reusable primitives: Card, Badge, FeaturePanel, Placeholder
  features/
    screenshot-bug-reporter/   # ✅ implemented (SmolVLM-Instruct, VQA)
    ai-accessibility/          # ✅ implemented (Florence-2, image captioning)
    smart-ticket-creator/
    pause-and-ask/
    semantic-search/
    registry.ts  # Navigation metadata for the tab bar
  hooks/         # Feature-specific hooks (added later)
  lib/           # cn() className helper
  types/         # Shared types (Feature, FeatureId, BrowserTech)
  router.tsx     # Route config: lazy pages, / redirect, 404 fallback
  main.tsx       # Entry point (RouterProvider)
  index.css      # Tailwind import + theme
```

## Routing

Each feature is an independent, bookmarkable route served under a shared layout:

| Route | Feature |
| --- | --- |
| `/screenshot-bug-reporter` | Screenshot Bug Reporter |
| `/ai-accessibility` | AI Accessibility |
| `/smart-ticket-creator` | Smart Ticket Creator |
| `/pause-and-ask` | Pause & Ask |
| `/semantic-search` | Semantic Search |

- `/` redirects to `/screenshot-bug-reporter`.
- Unknown routes render a simple **Page not found** fallback.
- Every feature page is lazy-loaded with `React.lazy()` and streamed in under a
  `Suspense` fallback, so no feature code (or future on-demand AI model) is
  fetched until its route is visited.

### Adding a feature

1. Create a folder under `src/features/` whose main component is the **default
   export**, built from the shared `FeaturePanel` and `Placeholder` primitives.
2. Add navigation metadata (`id`, `path`, `label`, `title`, `icon`) to
   `src/features/registry.ts` so it appears in the tab bar.
3. Register a lazy route for it in `src/router.tsx`.

## License

For demonstration purposes.

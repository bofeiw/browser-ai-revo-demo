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
| **Smart Ticket Creator** ✅ | Convert an unstructured natural-language complaint into a structured issue ticket with a local language model. |
| **Pause & Ask** ✅ | Start your webcam, pause on a frame, and ask a local vision-language model natural-language questions about it. |
| **Semantic Search** | Search through local documents using semantic similarity. |

> **Status:** The **Screenshot Bug Reporter**, **AI Accessibility**, **Smart
> Ticket Creator**, and **Pause & Ask** tabs are fully implemented and run real
> in-browser inference. The remaining tab (**Semantic Search**) is still a
> clearly labeled placeholder and will be implemented in a later iteration.

See [Screenshot Bug Reporter](#screenshot-bug-reporter-1),
[AI Accessibility](#ai-accessibility--local-alt-text-generator),
[Smart Ticket Creator](#smart-ticket-creator-1), and
[Pause & Ask](#pause--ask-1) below for each feature's model, runtime,
requirements, and known limitations.

## Tech stack

- [React 19](https://react.dev/) with TypeScript
- [Vite](https://vite.dev/) for dev server and builds
- [React Router v7](https://reactrouter.com/) for routing (lazy-loaded routes)
- [Tailwind CSS v4](https://tailwindcss.com/) for styling
- [Lucide React](https://lucide.dev/) for icons
- [Transformers.js v4](https://huggingface.co/docs/transformers.js) (`@huggingface/transformers`) for in-browser, WebGPU-accelerated model inference
- [Zod](https://zod.dev/) for validating model-generated structured output (Smart Ticket Creator)

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

## Smart Ticket Creator

Paste a rough, informal complaint — the kind a user actually writes — and a
local language model rewrites it into a clean, structured issue ticket: a
concise title, a professional description, a suggested type and priority,
expected vs. actual behavior, steps to reproduce, and the information still
missing to investigate. Every field is editable, and the ticket can be copied as
Markdown (**Copy Ticket**) or as raw JSON (**Copy JSON**). Two example complaints
(one messy, one deliberately vague) are one click away for quick testing.

For example, this complaint:

> So I clicked save like five times and nothing happened, then the page froze
> and I had to refresh, and now I'm not even sure if my changes were saved. This
> happened twice today and it's really annoying.

becomes a ticket with a title like _"Save button unresponsive; page freezes
after repeated clicks"_, the fact _"clicked Save five times"_ and _"happened
twice today"_ preserved in steps/description, priority left at **Medium** or
**Unknown** (the word "annoying" is not treated as evidence of High impact), and
questions such as _"Which browser and OS?"_ listed under missing information
rather than invented.

**Nothing leaves the device.** The model is downloaded from the Hugging Face Hub
once (then cached by the browser) and all inference runs locally via WebGPU. Your
complaint text is only ever read in your browser and in the Web Worker.

### Model and runtime

| | |
| --- | --- |
| **Model** | [`onnx-community/Qwen2.5-0.5B-Instruct`](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct) — the ONNX build of [`Qwen/Qwen2.5-0.5B-Instruct`](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct), a 0.5B-parameter instruction-tuned text-generation model. |
| **Task** | **Text generation** — read an unstructured complaint and emit a single structured JSON ticket. |
| **Runtime** | [Transformers.js v4](https://huggingface.co/blog/transformersjs-v4) (`@huggingface/transformers`), which runs ONNX models in the browser. |
| **Acceleration** | **WebGPU** when available, with a WebAssembly (CPU) fallback. |
| **Quantization** | `q4` on **both** WebGPU and the CPU/WASM fallback. `q4f16` is intentionally **not** used — see _Known limitations_ (it overflows to NaN on the ONNX Runtime WebGPU backend and produces a "!!!!!" loop). |
| **One-shot prompt** | A worked input→output example is included in the prompt; a 0.5B model follows the JSON shape and honesty rules far more reliably with a concrete demonstration than with rules alone. |
| **Validation** | [Zod](https://zod.dev/) — the model's JSON is parsed and validated against a schema; the `Ticket` TypeScript type is inferred from that same schema. |

### Why this model?

This feature is **structured extraction** — turn messy free text into one
well-formed JSON object following a fixed schema and strict honesty rules. That
is an instruction-following + JSON-generation task, which drove the choice:

- **Qwen2.5-Instruct is explicitly tuned for exactly this.** The Qwen2.5 model
  card highlights significant improvements in _instruction following_ and in
  _generating structured outputs, especially JSON_ — the two capabilities this
  feature depends on. (Content was rephrased for compliance with licensing
  restrictions.) See the
  [Qwen2.5-0.5B-Instruct model card](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct).
- **0.5B, chosen to actually load in the browser.** The 1.5B sibling has
  stronger instruction-following, but in `q4` (the only numerically stable
  precision on WebGPU — see below) its ~1.79 GB of weights plus ONNX session
  buffers overflow available memory on many machines and fail session creation
  with `std::bad_alloc`. The 0.5B `q4` build is **~786 MB** and loads reliably.
  A working smaller model beats an unloadable larger one; the quality gap is
  narrowed with a one-shot example prompt, defensive JSON parsing, and a local
  retry. The 0.5B build is also the more battle-tested browser model (tens of
  thousands of downloads, many live Transformers.js chat demos).
- **It has a verified Transformers.js implementation.** `onnx-community`
  publishes the official ONNX weights for Transformers.js, and the worker follows
  the canonical
  [`llama-3.2-webgpu`](https://github.com/huggingface/transformers.js-examples/tree/main/llama-3.2-webgpu)
  text-generation example (same `AutoModelForCausalLM` + `TextStreamer` +
  `apply_chat_template` API, warm-up pass, and interruptable stopping criteria).
- **Why not a constrained-decoding runtime?** Hugging Face's own
  [Github Issue Generator demo](https://github.com/huggingface/smollm/tree/main/tools/smollm_local_inference)
  solves a near-identical problem using **WebLLM + XGrammar** for grammar-forced
  JSON. That is a genuinely strong approach, but it means a second inference
  runtime. Since the brief prefers Transformers.js v4 and Qwen2.5 follows a
  JSON-shaped prompt reliably, this feature stays on one runtime and validates
  with Zod instead (see _Known limitations_). Transformers.js does not currently
  expose constrained/grammar decoding.

### Approximate download size

The one-time model download is the quantized decoder plus the tokenizer:

| Backend | Weights file | Size |
| --- | --- | --- |
| WebGPU (`q4`) | `onnx/model_q4.onnx` | **≈ 786 MB** |
| CPU/WASM (`q4`) | `onnx/model_q4.onnx` | **≈ 786 MB** |

Plus the tokenizer (`tokenizer.json` ≈ 7 MB, `vocab.json` ≈ 2.8 MB,
`merges.txt` ≈ 1.7 MB) and small config files. Files are cached by the browser,
so later visits and generations reuse them with no re-download. (`q4f16` would
download in ~483 MB, but it is unusable here — see _Known limitations_.)

### Browser and hardware requirements

- A **WebGPU-capable desktop browser** is strongly recommended — recent Chrome,
  Edge, or other Chromium-based browsers. Check [WebGPU support](https://caniuse.com/webgpu).
- A GPU with roughly **1–1.5 GB of free VRAM** for the model plus runtime
  buffers.
- Without WebGPU the feature falls back to the CPU (WASM) backend with `q4`
  weights, which is **significantly slower** and needs enough free RAM; on
  low-memory machines it may be impractical.
- A reasonably fast connection for the one-time model download.

### Expected performance

- First run is slow: the ~1.2 GB download plus WebGPU shader compilation (there
  is a one-token warm-up pass to pay that cost up front). Subsequent generations
  reuse the loaded model and are much faster.
- On a typical discrete GPU, generation streams at tens of tokens per second
  (shown live as `tok/s`); a full ticket is a few hundred tokens. The CPU
  fallback is far slower.
- The model is loaded lazily on the first **Generate Ticket** click and reused
  for every later generation in the session.

### Structured generation and known limitations

- **Prompt-based JSON, validated with Zod — not grammar-constrained.**
  Transformers.js has no constrained-decoding API, so the model is firmly
  prompted to emit one JSON object, and the result is then recovered and
  validated in code:
  1. The first balanced `{…}` object is extracted from the raw output (tolerating
     ```json fences and any stray prose around it).
  2. Common malformations are repaired defensively (trailing commas, curly
     quotes) before `JSON.parse`.
  3. The parsed object is validated with a Zod schema that coerces a
     recognizable-but-imperfect payload into the strict ticket shape and falls
     back to honest defaults (`"Other"` / `"Unknown"`, `""`, `[]`).
  4. If the first attempt is unparseable, there is **one local retry** with a
     firmer prompt. If that also fails, the UI shows a clear error.
- **No remote repair, no hardcoded ticket.** Recovery is entirely on-device. The
  feature never calls a remote model to fix invalid output and never silently
  substitutes a canned ticket — if valid JSON cannot be obtained locally, it says
  so.
- **The ticket is a draft, not a verdict.** A small model can still misread
  nuance, mis-rank priority, or phrase something awkwardly. Priority is
  deliberately cautious and defaults to `Unknown`; the "missing information"
  field exists precisely because the model is told to ask rather than invent.
  **Always review before filing.**
- A 0.5B model occasionally produces a near-miss JSON object on the first try;
  the retry usually recovers it, but very long or contradictory complaints can
  still fail validation. It is a small model — expect the odd awkward phrasing or
  mis-ranked priority, which is exactly why every field is editable.
- **Why `q4` and not `q4f16`?** The smaller `q4f16` build keeps `f16`
  activations, and those overflow to `NaN` inside the current ONNX Runtime
  WebGPU kernels for this model. The logits collapse and the model emits token 0
  ("!") forever — an endless `"!!!!!…"` loop with no valid JSON. This is a known
  runtime issue, not a prompt or model-quality problem
  ([microsoft/onnxruntime#26732](https://github.com/microsoft/onnxruntime/issues/26732),
  [huggingface/transformers.js#1317](https://github.com/huggingface/transformers.js/issues/1317)).
  Plain `q4` keeps 4-bit weights with `f32` activations, which is numerically
  stable on WebGPU and still GPU-accelerated, at the cost of a larger download.
  The parser also detects a degenerate repeating-character loop and reports it
  explicitly, so if a future/other backend regresses, the UI says what happened
  instead of showing a misleading "no JSON" error.

### How it's built (architecture)

The feature is split into focused modules under
`src/features/smart-ticket-creator/`:

```text
worker.ts           # Model init + lazy load + JSON generation + local retry (Web Worker)
useTicketCreator.ts # React hook: owns the worker lifecycle and exposes state/actions
prompt.ts           # System/user chat messages encoding the AI-behavior policy
parseTicket.ts      # JSON extraction + defensive repair + Zod validation + normalize
formatTicket.ts     # Serialize a ticket to Markdown and to JSON for the clipboard
examples.ts         # The two sample complaints
types.ts            # Zod ticket schema (source of truth), Ticket type, worker protocol
components/         # ModelStatus (download progress), TicketEditor (editable fields)
```

The model is loaded lazily on the first generation, runs in a Web Worker to keep
the UI responsive, and is reused across subsequent generations. It is a separate
worker and model from the other features — each feature downloads its own model
only when its route is visited, so an unrelated tab never pulls weights it
doesn't need.

### How to run and test

1. `npm install` then `npm run dev`, and open the **Ticket Creator** tab (or go
   to `/smart-ticket-creator`).
2. Click an example chip (**Messy: Save button** or **Vague: it broke**), or type
   your own complaint, then press **Generate Ticket**.
3. The first run downloads the model (watch the per-file progress); later runs
   reuse it.
4. Review and edit any field, then **Copy Ticket** (Markdown) or **Copy JSON**.
   **Reset** clears the input and output (the model stays loaded).

## Pause & Ask

Start your webcam, watch the live preview, then **Pause Frame** to freeze the
current view. Type a natural-language question in **Ask about this frame** —
_"What objects are visible?"_, _"What color is the object in the center?"_,
_"How many people are in the frame?"_ — and a local vision-language model answers
based on that frozen image. You can ask as many questions as you like about the
same frame, then **Resume Camera** for a new one. An optional **Live AI
Description** toggle periodically narrates the live scene.

**Nothing leaves the device.** There is no backend and no inference API. The
camera stream is rendered locally, frames are captured to an in-memory canvas,
and the model (downloaded once from the Hugging Face Hub, then cached by the
browser) runs entirely in your browser via WebGPU. **Captured frames and your
questions are never uploaded.**

### Model and runtime

| | |
| --- | --- |
| **Model** | [`onnx-community/LFM2.5-VL-450M-ONNX`](https://huggingface.co/onnx-community/LFM2.5-VL-450M-ONNX) — Liquid AI's [LFM2.5-VL-450M](https://huggingface.co/docs/transformers/main/model_doc/lfm2_vl), a ~0.45B-parameter instruction-tuned vision-language model (LFM2.5-350M language backbone + SigLIP2 NaFlex 86M vision encoder), converted to ONNX for Transformers.js. |
| **Task** | **Visual question answering** — accepts an image **plus** a free-form question and generates an answer grounded in the image. The same model also produces the short scene captions for Live AI Description. |
| **Runtime** | [Transformers.js v4](https://huggingface.co/blog/transformersjs-v4) (`@huggingface/transformers`), which runs ONNX models in the browser. |
| **Acceleration** | **WebGPU** when available, with a WebAssembly (CPU) fallback. |
| **Quantization** | Per-submodel: `fp16` vision encoder + token embeddings and `q4f16` decoder on WebGPU (when the adapter supports `shader-f16`); `q4` everywhere on the CPU/WASM fallback (and on WebGPU without `shader-f16`). |

### Why this model?

The brief requires **genuine visual question answering** — the model must take a
captured frame *and* an arbitrary question and answer about that specific image —
not fixed-task image captioning. That ruled some otherwise-capable models in and
out:

- **LFM2.5-VL-450M is a real instruction-following VLM.** It accepts interleaved
  image + text and follows free-form questions, so it genuinely answers _"what
  color is the object in the center?"_ rather than only emitting a canned
  caption. It scores well on real-world VQA for its size (e.g. RealWorldQA 58.4,
  MMBench-dev-en 60.9 on its [model card](https://huggingface.co/onnx-community/LFM2.5-VL-450M-ONNX)).
- **It is purpose-built for exactly this scenario.** Liquid AI ships an official
  [real-time video-stream captioning WebGPU demo](https://docs.liquid.ai/examples/web/vl-webgpu-demo)
  for this model family and documents the exact Transformers.js v4 usage
  (`AutoModelForImageTextToText` + the `dtype` map this worker uses). It is part
  of the [Transformers.js v4 demo collection](https://huggingface.co/collections/webml-community/transformersjs-v4-demos).
- **It's small enough for an interactive, repeatable loop.** At ~0.45B
  parameters (~350 MB quantized) it loads far faster and uses far less VRAM than
  the 2.2B SmolVLM-Instruct used by the Bug Reporter — important when the user
  asks several questions in a row and (optionally) runs a periodic caption loop.
- **One model covers both modes.** Because it does both VQA and captioning well,
  Live AI Description reuses the *same* loaded model instead of downloading a
  second one. No extra GPU memory is spent on a dedicated captioner.
- **Florence-2 was considered for captioning and rejected as the primary model.**
  Florence-2 (used by the AI Accessibility tab) only responds to a fixed set of
  task tokens and is **not** instruction-following — it cannot answer an
  arbitrary question about a frame, which is the whole point of this feature. It
  is therefore not used here.

### Approximate download size

With the WebGPU `fp16`/`q4f16` precision above, the first use downloads roughly
**~350–400 MB** of model weights (fp16 vision encoder + token embeddings, q4f16
decoder, plus tokenizer/processor config). The exact total varies with whether
the adapter supports `shader-f16` (fp16 vs. the `q4` fallback submodels). Files
are cached by the browser, so later visits and questions reuse them with no
re-download.

### Camera permission requirements

- The webcam is requested **only when you click Start Camera** — never on page
  load — via the browser's [MediaDevices `getUserMedia`](https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia)
  API, and the browser will prompt for permission.
- Camera access requires a **secure context**: `https://` or `http://localhost`.
  Over plain `http://` on a remote host the browser blocks `getUserMedia` and the
  feature reports that the camera is unavailable.
- Denied permission, no camera present, or a camera already in use by another app
  are all handled gracefully with a clear message.
- **Stop Camera** releases every media track, and the camera is also released
  automatically when you navigate away from the tab (component unmount).

### Browser and hardware requirements

- A **WebGPU-capable desktop browser** is strongly recommended — recent Chrome,
  Edge, or other Chromium-based browsers. Check [WebGPU support](https://caniuse.com/webgpu).
- A webcam, and a GPU with roughly **1–2 GB of free VRAM** for the model plus
  runtime buffers.
- Without WebGPU the feature falls back to the CPU (WASM) backend with `q4`
  weights, which is **significantly slower** (expect multi-second answers) but
  still fully local.
- A reasonably fast connection for the one-time model download.

### Expected performance

- First run is slow: the one-time model download plus WebGPU shader compilation.
  Subsequent questions reuse the loaded model and are much faster.
- On a typical discrete GPU, answers stream at tens of tokens per second; a short
  answer is a second or two after the first run. The CPU fallback is far slower.
- **Only one inference runs at a time.** Asking a question while another is in
  flight is ignored, and the Live AI Description loop never queues work: the next
  caption is scheduled only *after* the previous one finishes (a fixed delay
  between completions), so inference requests can never pile up.
- Live AI Description runs **only while the camera is live** — it pauses
  automatically while you ask about a frozen frame, so captioning and VQA never
  compete for the GPU.

### Known limitations

- **Answers are a draft, not ground truth — always sanity-check them.** It is a
  compact on-device model; it can miss objects, miscount, or misjudge colors, and
  it is explicitly **not well suited to fine-grained OCR** (reading small text on
  a sign) or knowledge-intensive questions. The system prompt asks it to express
  uncertainty rather than invent details, but it can still be confidently wrong.
- **No fake or canned answers.** Every answer is generated live from the actual
  captured frame and your actual question. There are no hardcoded responses and
  no remote/cloud fallback — if local inference can't run, the feature reports an
  error instead of silently calling an API.
- First run is slow because of the model download and WebGPU shader compilation.
- The CPU/WASM fallback can be impractically slow and memory-hungry for the
  (optional) continuous caption loop on low-end machines; disable Live AI
  Description there and use Pause & Ask on demand.

### How it's built (architecture)

The feature is split into focused modules under `src/features/pause-and-ask/`:

```text
worker.ts         # Model init + lazy load + VQA/caption inference (Web Worker)
useVqa.ts         # React hook: owns the worker lifecycle, VQA + caption actions, status
useCamera.ts      # React hook: webcam start/stop/pause/resume + capture + cleanup
camera.ts         # Framework-free MediaDevices + canvas frame-capture helpers
types.ts          # CapturedFrame, device/support types, worker message protocol
components/        # CameraStage (preview + controls), ModelStatus (download progress)
```

Camera handling, frame capture, model loading/inference, and UI state are kept in
separate modules. The model is loaded lazily on the first question, runs in a Web
Worker to keep the preview responsive, and is reused for every subsequent
question (including a brand-new paused frame). It is a separate worker and model
from the other tabs — each feature downloads its own model only when its route is
visited, so an unrelated tab never pulls weights it doesn't need.

### How to run and test

1. `npm install` then `npm run dev`, and open the **Pause & Ask** tab (or go to
   `/pause-and-ask`). Use `http://localhost` or HTTPS so the browser allows the
   camera.
2. Click **Start Camera** and grant permission. You should see your live webcam.
3. Click **Pause Frame** to freeze the current view (a "Frame paused" badge
   appears).
4. Type a question (or click an example chip) and press **Ask AI**. The first run
   downloads the model (watch the per-file progress); later questions reuse it.
   The answer streams in below.
5. Ask more questions about the **same** frozen frame, then **Resume Camera** for
   a new one. Optionally enable **Live AI Description** while live.
6. **Stop Camera** releases the webcam; navigating away does the same
   automatically.

## Project structure

```text
src/
  components/
    layout/      # RootLayout (shell + Outlet), Header, Tabs (NavLink), Footer, NotFound
    ui/          # Reusable primitives: Card, Badge, FeaturePanel, Placeholder
  features/
    screenshot-bug-reporter/   # ✅ implemented (SmolVLM-Instruct, VQA)
    ai-accessibility/          # ✅ implemented (Florence-2, image captioning)
    smart-ticket-creator/      # ✅ implemented (Qwen2.5-1.5B-Instruct, structured extraction)
    pause-and-ask/             # ✅ implemented (LFM2.5-VL-450M, live camera VQA)
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

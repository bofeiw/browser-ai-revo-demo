# Browser AI · RevoSurge Lab

A local adaptation of [Sylwia Laskowska's practical-browser-ai](https://github.com/sylwia-lask/practical-browser-ai) for an internal AI Bites presentation.

## Run

```sh
npm install
npm run dev
```

Open the address printed by Vite (normally `http://localhost:5173`).

| Route | Feature |
| --- | --- |
| `/background-remover` | Remove an image background and download the result |
| `/smart-ticket-creator` | Convert a complaint into an editable ticket |
| `/campaign-creator` | Convert a brief into an editable campaign draft |
| `/semantic-search` | Search local example documents by meaning |

Append `?present=1` for the presentation view. It hides technical badges, raw output, navigation and diagnostic details. Escape returns to an embedding presentation. The old accessibility and camera demos have been removed.

## Campaign Creator

Campaign and ticket creation reuse the same Qwen2.5-0.5B-Instruct model, worker implementation, generation loop, retry and browser download cache. Each open feature page owns its own worker; switching routes releases that worker. Separate open tabs can occupy separate memory.

Campaign output includes name, product, objective, countries, daily budget, start/end dates and ad format. All fields are editable. Model output is checked against the source brief: unsupported product names, dates, formats and countries are cleared; the explicit daily budget is preserved from the source. Conservative extraction may leave a field blank even when a person could infer it. Common Chinese/English country and objective aliases are supported; this is not a universal campaign-language parser.

The result is a **draft**, not a live campaign. Downloading a draft does not call AdWave, launch ads or spend money. Incomplete fields are marked, and invalid dates or nonpositive budgets block download. The user must verify all settings before downstream use.

## Loading and device behavior

Models load only when needed. Background removal downloads approximately 176 MB of weights; ticket/campaign generation approximately 786 MB plus tokenizer files. Browser caching can avoid repeated downloads but is not guaranteed permanent. Model load time, memory consumption and inference speed depend on the device.

The matching ONNX runtime files are bundled locally using `src/features/shared/runtime.ts`, avoiding a jsDelivr dependency during inference. Model downloads still require access to Hugging Face. There is no AI inference service. Full offline page availability is not guaranteed.

## Verify

```sh
npm test
npm run build
```

The tests cover campaign parsing, missing information, dates/budgets, source grounding, and ticket/campaign task dispatch. The test runner uses the project's existing Vite installation, with no additional test dependency.

For live checks, try both complete and incomplete Chinese briefs, an English brief, edit fields and download a draft. Then generate a ticket, remove an image background and run semantic search. Test on the actual presentation computer; a successful build does not prove model quality or speed.

## Presentation

The HTML deck lives separately in the sibling AI Bites project at `../26.04.17-ai-bites/browser-ai.html`; it is not included in this demo repository. The presenter switches browser tabs manually to show the demos.

## Credits and use restrictions

Original project and article by Sylwia Laskowska: [Your Browser Can Do WHAT?!](https://dev.to/sylwia-lask/your-browser-can-do-what-5-ai-features-that-actually-work-1blb).

The original repository describes its use as “For demonstration purposes.” No broader code license is assumed. The background model [BRIA RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4) requires a separate commercial agreement for commercial use. Confirm both code and model rights before shipping in a product. This adaptation remains a local demonstration.

## GitHub Pages

The site deploys to `https://bofeiw.github.io/browser-ai-revo-demo/` through the included GitHub Actions workflow when `main` is pushed. Configure the repository's Pages source as **GitHub Actions**.

The deployment builds with `GITHUB_PAGES=true`; Vite and the SPA fallback use `/browser-ai-revo-demo/`. If the repository is renamed, update `vite.config.ts` and `public/404.html` together.

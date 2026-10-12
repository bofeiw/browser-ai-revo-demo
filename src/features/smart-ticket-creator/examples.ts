/**
 * Example complaints users can load into the textarea for quick testing.
 *
 * These are deliberately messy and emotional, with one that is intentionally
 * vague/incomplete — so the demo exercises both "lots of detail to restructure"
 * and "not enough information, must ask questions" paths.
 */

export interface ExampleComplaint {
  label: string
  text: string
}

export const EXAMPLE_COMPLAINTS: ExampleComplaint[] = [
  {
    label: 'Messy: Save button',
    text: "So I clicked save like five times and nothing happened, then the page froze and I had to refresh, and now I'm not even sure if my changes were saved. This happened twice today and it's really annoying.",
  },
  {
    label: 'Vague: it broke',
    text: "idk it just stopped working this morning?? it was fine yesterday. please fix asap this is urgent!!",
  },
]

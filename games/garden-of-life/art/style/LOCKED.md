# Locked style: candidate B, 1970s Singapore poster

Decided by a three-lens judge panel (senior legibility, production repeatability,
product warmth), full verdicts in BUILD-REPORT-2.md. B took legibility 9/10 and
warmth 9/10; production scored it 6/10 for halftone drift, moire at downscale,
and aged-cast bleed into cutouts. Those three risks are handled by the scaffold
below, which borrows candidate D's production hygiene: flat fills, crisp closed
contours, pattern density near zero on small assets, aged texture lives in the
UI paper and never in the asset.

Reference image: `candidate-b.png` (generation id
`5cc066a2-e952-48e6-ae65-9fa3932496a6`). Pass it as the image reference on
every asset generation for style consistency.

## Master prompt scaffold

Every asset prompt is built as:

> 1970s Singapore poster illustration style matching the reference image: flat
> warm colors (cream, amber, terracotta, olive green), bold dark outlines,
> simple friendly rounded shapes, warm golden light. [SUBJECT CLAUSE].
> [BACKGROUND CLAUSE]. No text anywhere in the image.

Background clause by asset type:

- Cutout assets (heritage objects, meal dishes, UI props, expressions if
  cropped): "single subject centered on a plain flat pale cream background,
  no scene, no cast shadows, subject fills most of the frame"
- Scenes (backgrounds): "subtle halftone grain allowed in large areas only"
- Small props and icons: "no halftone, no texture, extra bold outlines,
  extra simple shapes"

## Character sheet

The gardener is Auntie Bee: Singaporean Chinese auntie in her sixties, grey
bun under a wide straw sun hat, floral blouse in cream and terracotta, warm
open smile, laugh lines. Match the reference image's rendering of her exactly.
Six expressions needed: welcome, happy, thinking, watering, concerned,
celebrate. Use the Higgsfield character-sheet workflow guidance plus the
reference image so the face stays the same person in all six.

## Plants

Plants stay procedural SVG (the composer). Palette matching to this style:
warm-leaning greens (olive over emerald), amber, terracotta, deep warm red,
muted violet. The plant-traits.json palettes already lean warm; final palette
check happens at integration against the locked backgrounds.

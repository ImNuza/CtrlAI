# Asset prompts for the garden space and the gardener

Copy-paste prompts for Gemini, sized and framed for where each asset actually
lands in the code. Every size here is measured from the running build at
390x844, not estimated.

Two things to know before you start:

- **Match the plates we already have.** Thirty botanical plates are already in
  the game. The style block in section 2 is the one they were made from, so
  reuse it verbatim. A consistent set of adequate art beats a mixed set of
  good art, and "art consistency" is named in the Project Quality rubric line.
- **Do not ask for transparent backgrounds.** Gemini is unreliable at alpha.
  Ask for a flat background instead and `tools/process_miora.py` cuts it out,
  which is exactly how the existing plates were handled.

---

## 1. How to run this

1. Generate at the **highest resolution offered**, square unless a section
   says otherwise. Everything gets downscaled by the pipeline.
2. **Lock the character first.** Generate gardener pose 1, pick the best, then
   attach that image as a reference for every other pose. Text alone will not
   hold a face across eight images.
3. Save into a folder per group, any filenames. I map by content, not name.
4. Tell me where the folder is and I will extend `tools/process_miora.py` to
   cut, trim, palette-reduce and wire them in.

**One retry per asset on a clear miss, then move on.**

---

## 2. The style block (prepend to every prompt)

```
STYLE: Classical botanical illustration, vintage Singapore herbarium
field-journal. Fine sepia or warm dark-brown ink outline, 1-2px, with
cross-hatching for volume. Soft watercolour washes, never flat fills.
Visible paper grain.

COLOUR: Maximum 45% saturation. Value range 56-100% brightness. Never pure
black, never pure white. All shadows warm: taupe #958579 or deep olive
#44573D. Never grey, never blue-black. Greens restricted to the olive-to-sage
band: no blue-greens, no yellow-greens.

LIGHTING: Soft diffuse overcast. No hard specular highlights. No cast black
shadows.

NEGATIVE: no neon, no high saturation, no blue-green, no pure black, no hard
sunlight, no drop shadows, no text, no watermark, no border, no frame,
no 3D render, no photorealism, no glossy plastic, no cartoon outlines.
```

---

## 3. The gardener

**This is the biggest visible gap.** The gardener is currently three CSS
shapes: a circle, a blob and a leaf. It is a placeholder and it looks like one.

**Read this before generating.** The avatar draws at **52x52 px**. A detailed
illustration turns to mush at that size. Two consequences:

- Every prompt below asks for a **bold, simple, high-contrast figure** with a
  readable silhouette. Detail is the enemy here.
- I would also **raise the avatar to about 80px** in the code, which is a
  two-line change and makes the character legible next to the 101px patches.
  Say the word and I will.

The figure is drawn **side-on** and the code mirrors it for the other
direction, so generate everything **facing right**. Do not generate a
left-facing version.

### Pose 1: idle (generate this first, use as the reference for the rest)

```
[STYLE BLOCK]

SUBJECT: An elderly Singaporean gardener standing still, side view, facing
right, full body, feet together. Straw sun hat, simple loose work shirt,
rolled trousers, sandals. Warm, calm, dignified. Chunky simplified shapes
with a strong readable silhouette, as if designed to be recognised at
thumbnail size.

COMPOSITION: Single figure, centred, standing on the bottom edge of the
frame. Flat solid #EEE9D9 background, completely uniform, no texture, no
gradient, no ground shadow, no scenery.
```

### Poses 2 to 6

Same block, attach pose 1 as the reference image, and swap the first sentence:

| # | Replace the subject sentence with |
|---|---|
| 2 | `...mid-stride walking, side view facing right, front leg forward, arms swinging.` |
| 3 | `...mid-stride walking, side view facing right, opposite leg forward. The second frame of a two-frame walk cycle.` |
| 4 | `...bending forward to water a plant, side view facing right, holding a small watering can tipped down.` |
| 5 | `...crouching to press a seed into the ground, side view facing right, one hand reaching to the soil.` |
| 6 | `...standing upright and pleased, side view facing right, one hand raised in a small satisfied gesture.` |

Poses 2 and 3 are the walk cycle and matter most. If you only generate three,
make them 1, 2 and 3.

---

## 4. The garden space

### 4a. Grass, seamlessly tiling

The grass repeats every **210x210 px** across the whole field.

**Be aware this one is genuinely hard.** Diffusion models do not reliably
produce tiles that meet at the edges, and a seam repeating every 210px is very
visible. So do not try to get a perfect tile out of Gemini. Ask for a **large
even field of grass** instead, and I will make it seamless in the pipeline
with an offset-and-blend pass.

```
[STYLE BLOCK]

SUBJECT: A large even expanse of short tropical lawn grass viewed from
directly overhead, filling the entire frame edge to edge. Fine individual
blades in olive and sage, slight variation in blade direction, a few tiny
clover leaves scattered through it.

COMPOSITION: Completely flat overhead view, no horizon, no sky, no objects,
no path, no shadow, no focal point anywhere. The texture must be even across
the whole image with no lighter or darker region, so no part of it reads as
the centre.
```

The "no focal point, even across the whole image" instruction is the important
one. An even texture survives tiling; one with a bright patch does not.

### 4b. Soil patches, three states

These render **84 x 56 px**, which is **3:2**. Generate at 3:2, or 4:3 if 3:2
is not offered. The current plates are square, and CSS `cover` throws away
their top and bottom to fit, which is why the soil looks like a cropped tile
rather than a patch of ground.

Each is a patch of earth seen from slightly above, filling the frame.

| State | Subject line |
|---|---|
| Bare | `A rectangular patch of dry, pale, untilled earth, crumbly and light in colour, small pebbles and dry fragments scattered through it. Nothing growing.` |
| Tilled | `A rectangular patch of freshly turned earth in neat parallel furrows, dark and damp, ready for planting. Nothing growing yet.` |
| Planted | `A rectangular patch of rich dark worked soil, damp and fertile, fine crumb texture, a few small stones. Nothing growing.` |

Append to each:

```
[STYLE BLOCK]

COMPOSITION: Horizontal 3:2. Viewed from slightly above at a shallow angle.
The soil fills the entire frame edge to edge with no background visible.
No plants, no seedlings, no tools, no border.
```

**Nothing growing** matters: the plant plates are drawn on top, so a patch with
its own sprout in it will double up.

### 4c. Scatter details, to break up the lawn

Right now the grass is a flat repeating texture and the field reads empty
between rows. Small objects scattered across it fix that. Generate each as a
separate image, square.

- `A small cluster of three weathered garden stones resting on grass.`
- `A terracotta watering can resting on its side on grass.`
- `A few fallen dry leaves scattered on grass.`
- `A small clump of tiny white wildflowers growing in grass.`
- `A short length of low woven bamboo garden edging, seen from slightly above.`

Append to each:

```
[STYLE BLOCK]

COMPOSITION: One small object group, centred, resting on the ground, seen from
slightly above. Flat solid #EEE9D9 background, completely uniform, no texture,
no gradient, no scenery, no shadow touching the frame edge.
```

### 4d. Field boundary

The field currently just stops at the edge of the screen. Optional, and lowest
priority of the four.

```
[STYLE BLOCK]

SUBJECT: A long low garden border of woven bamboo and weathered timber, seen
straight on from the side, running the full width of the frame. Simple,
rustic, low enough to see over.

COMPOSITION: Horizontal 16:9. The border runs edge to edge across the middle.
Flat solid #EEE9D9 background above and below it. No grass, no plants, no
scenery.
```

---

## 5. Still outstanding: Pandan

**Pandan has no plates and it is the seed every new player starts with.** It
still draws as the old flat SVG, so the first plant anyone sees is the one
that looks wrong, and in the shop it sits directly above a real plate. This is
the first thing in your demo video.

Five images, same five growth states as every other plant. Match the existing
set exactly: single specimen, portrait, plant sitting on the bottom edge.

```
[STYLE BLOCK]

SUBJECT: Pandan Herb (Pandanus amaryllifolius), [STATE]. Single specimen,
portrait orientation. Long narrow strap-shaped bright green leaves growing in
a fan from a central base. Dominant colour #73875D.

COMPOSITION: One plant, centred, roots and base at the bottom edge of the
frame. Flat solid #EEE9D9 background, completely uniform. No pot, no hands,
no text, no scenery.
```

`[STATE]` in turn:

1. `a single seed just pressed into a small mound of dark soil, nothing above ground yet`
2. `a first pale shoot, two or three short narrow leaves emerging`
3. `established and healthy, a full fan of long strap leaves, no flower`
4. `at its fullest and most lush, leaves long and glossy` (pandan does not
   flower usefully, so this is the bloom state)
5. `drooping and thirsty, leaves soft, downturned and dulled, still alive and
   recoverable`

State 5 must read as **thirsty, never dead**. Nothing in this game shames the
player.

---

## 6. Priority

If you cannot generate everything, this is the order:

| # | Group | Images | Why |
|---|---|---|---|
| 1 | Pandan, section 5 | 5 | The one visibly wrong plant, and the first one seen |
| 2 | Gardener poses 1 to 3, section 3 | 3 | The character is three CSS blobs today |
| 3 | Soil patches, section 4b | 3 | At 3:2 this time, so they stop being cropped |
| 4 | Grass, section 4a | 1 | Better base texture |
| 5 | Gardener poses 4 to 6 | 3 | Nice, not needed |
| 6 | Scatter details, section 4c | 5 | Makes the field feel inhabited |
| 7 | Field boundary, section 4d | 1 | Lowest value |

**20 images covers 1 to 6.** Nine covers the first three groups, which is what
would actually change how the game looks.

---

## 7. What happens to the files

Drop them anywhere and tell me the path. I will:

- extend `tools/process_miora.py` with a `make_seamless` pass for the grass
  and a 16:9 branch for the patches
- cut the flat backgrounds with the existing edge flood fill, which is what
  keeps pale details like white petals and roots intact
- palette-reduce to keep each sprite near 15KB, since the whole app is 980KB
  and first paint is 404KB
- wire the gardener poses to the existing walk loop, which already has the
  `walking` and `facing-left` states waiting for real frames
- swap Pandan off its SVG fallback

The SVG fallback stays in the code either way. It is what draws if art fails
to load, and it is the honest before-and-after for the deck.

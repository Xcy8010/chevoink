# README banner generation record

- Original artwork: built-in image generation (`image_gen`), not the API/CLI fallback. Latest padding adjustment: deterministic crop with Sharp, as requested by the user; no regeneration.
- Output: [chevoink-readme-banner.png](./chevoink-readme-banner.png), 2171 × 420 PNG.
- Brand reference: [current project icon](../../public/favicon.png).
- Layout reference: user-provided DeterminFlow README screenshot, layout only.
- Revision: plain dark background, icon on the left, only “Chevoink” on the right. No Chinese subtitle, decorative curves or glow. Application icons are unchanged.

## Vertical padding crop

Cropped the existing 2171 × 724 artwork to the rectangle x=0, y=141, width=2171, height=420. Removed only dark top/bottom padding, retaining 58px above and below the visible artwork. No scaling, horizontal movement, or content changes; decoded pixels were checked against the same region of the original. The rejected regenerated crop attempt was not used.

## Previous optical-centering edit

Built-in image generation moved the icon/wordmark group left for optical balance. The README layout and text were not changed. The requested pixel offset below is an editing target, not a pixel-exact translation guarantee.

Precise layout edit of the provided existing 2172x724 README banner. Keep the SAME canvas dimensions/aspect ratio. Make exactly ONE change: translate the ENTIRE icon-plus-Chevoink-wordmark group 30 pixels to the LEFT (about 1.38 percent of the canvas width), with ZERO vertical movement. Move icon and text together as a rigid group: preserve their exact relative spacing, original size, font, letter shapes, colors, icon silhouette, face, turquoise swoosh and white tile. Do not redraw, enlarge, shrink, restyle or re-center the group. Current group left edge approximately x430; target left edge approximately x400, right edge also shifts left by 30. Preserve existing flat dark background, filling any vacated pixels with matching dark background. ONLY text is Chevoink. No new elements, no glow, no decoration, no Chinese, no extra padding or canvas crop. This is a tiny optical-centering correction, not a new design.

## Original generation prompt

Create a replacement GitHub README banner, extremely minimal like input image 2. Input 1: the existing Chevoink icon, identity reference to retain faithfully (black ink droplet with a white face, two black dot eyes, turquoise swoosh). Input 2: the DeterminFlow reference screenshot, composition and simplicity ONLY; never reproduce its branding or UI. Landscape 3:1. Entire background MUST be a perfectly uniform solid #0d1117: absolutely NO curves, strokes, patterns, glow, halo, gradient, vignette, noise, shadows, texture or decoration. ONE single horizontal row vertically centered: existing project icon on the LEFT, then ONLY the word 'Chevoink' on the RIGHT. Icon around the left quarter of the canvas with generous left margin, wordmark directly beside it with balanced spacing; the whole icon-wordmark group fills about 76% of width. Preserve icon precisely on a simple flat white rounded-square backing to retain contrast, no shadow, no shine, no 3D. Text is large off-white, clean medium-weight modern sans serif matching the restrained typography of the reference, not overly heavy or stylized. Exact text: Chevoink (C-h-e-v-o-i-n-k). There must be no Chinese text, subtitle, tagline, labels, badges, dividers, corner marks, watermark, interface or other content. Deliver the actual flat banner image, not a screenshot. Lots of clean solid dark negative space above and below. Brand clarity, horizontal icon-left/word-right alignment and plain background are the highest priorities.

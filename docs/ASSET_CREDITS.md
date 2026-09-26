# Asset sources & credits

## Poster (requested)

The brief refers to a supplied poster (dark nightclub backdrop, silhouetted
partygoers, champagne-gold type, violet/blue lights, sparkles, gold borders).
**It was not in the project folder**, so the visual language was re-created
from the description. Please add it as `public/media/poster/poster.jpg`
(or share it) so the art direction and social image can be checked against it.

## Stock photography (CC0 — no attribution required, credited anyway)

Machine-readable record: `public/media/stock/credits.json`. Downloaded
26 Sep 2026 via the Openverse API, resized/re-encoded locally with sharp.
**None of these depict Rubarru or this event**; every public caption says
“Mood reference · licensed stock photo — not Rubarru and not this event”.

| File | Subject | Creator | Source | License |
|---|---|---|---|---|
| `hero-crowd.jpg` | Crowd under violet/blue stage light | Leonhard Lenz | [Wikimedia Commons](https://commons.wikimedia.org/w/index.php?curid=135753052) | CC0 |
| `crowd-stage-blue.jpg` | Crowd facing smoky blue stage | Leonhard Lenz | [Wikimedia Commons](https://commons.wikimedia.org/w/index.php?curid=135752996) | CC0 |
| `led-ceiling.jpg` | LED ceiling lights | foldscheap | [Wikimedia Commons](https://commons.wikimedia.org/w/index.php?curid=90519951) | CC0 |
| `gold-lights-hands.jpg` | Silhouettes, golden stage light | — | [rawpixel](https://www.rawpixel.com/image/3283057/free-photo-image-music-rock-crowd-people) | CC0 |
| `dance-silhouettes-red.jpg` | Dancers in red haze | — | [rawpixel](https://www.rawpixel.com/image/5970031/party-people) | CC0 |
| `laser-dance.jpg` | Silhouettes under lasers | — | [rawpixel](https://www.rawpixel.com/image/6025895/photo-image-background-light-public-domain) | CC0 |
| `foosball.jpg` | Foosball table | — | [rawpixel](https://www.rawpixel.com/image/6037419/photo-image-public-domain-person-table) | CC0 |
| `mocktail-mint.jpg` | Lime & mint soda (“Virgin Mojito”) | Enaan Farhan | [WordPress Photo Directory](https://wordpress.org/photos/photo/260631584a/) | CC0 |
| `buffet-spread.jpg` | Buffet platters | — | [rawpixel](https://www.rawpixel.com/image/5922831/food-catering-free-public-domain-cc0-photo) | CC0 |

Notes:
- StockSnap images were considered but their CDN refuses direct downloads, so
  none were used.
- Food/drink photos are generic mood images and don't represent the menu
  (not announced). The drinks image is deliberately non-alcoholic.

## Venue media

No Rubarru photos/videos are used: reuse permission wasn't supplied. The
venue address text comes from https://rubarru.com/contact/ (checked
26 Sep 2026). Add approved media in **Admin → Settings → Approved media**
(`kind: venue | previous_event | mood`) with honest captions.

## Hero video

None yet: no suitably licensed clip was found (Wikimedia results were
unsuitable or sensitive). Provide a short muted loop (≤ 8 s, 720p H.264 MP4 +
optional WebM, ≤ ~2 MB) plus a poster frame and set it in Admin → Settings.

## Decorative SVGs

`public/media/decor/*.svg` are **temporary hand-made placeholders, not Haikei
output** — see `public/media/decor/HAIKEI_EXPORTS.md` for the exports needed.

## Fonts & code

- Bodoni Moda, Manrope, Pinyon Script — SIL Open Font License, via `next/font/google` (self-hosted at build).
- Lucide icons — ISC. Radix UI — MIT.
- Motion Primitives components (accordion, animated-group, carousel, in-view,
  sliding-number, text-effect, transition-panel) — MIT, adapted (see file headers).

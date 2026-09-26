/**
 * Licensed stock "mood" imagery (CC0, see docs/ASSET_CREDITS.md and
 * public/media/stock/credits.json). None of these photos show Rubarru or this
 * event; every public caption says so. Replace with organiser-approved venue
 * or previous-event media via Admin → Settings → Approved media.
 */
export type StockImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
  credit: string;
};

export const STOCK = {
  hero: {
    src: "/media/stock/hero-crowd.jpg",
    width: 2560,
    height: 1713,
    alt: "Silhouetted crowd with raised hands under violet and blue stage lights",
    credit: "Leonhard Lenz, Wikimedia Commons (CC0)",
  },
  crowdBlue: {
    src: "/media/stock/crowd-stage-blue.jpg",
    width: 1600,
    height: 1071,
    alt: "A crowd facing a smoky stage washed in blue light",
    credit: "Leonhard Lenz, Wikimedia Commons (CC0)",
  },
  ledCeiling: {
    src: "/media/stock/led-ceiling.jpg",
    width: 1600,
    height: 1064,
    alt: "A ceiling of colourful LED lights glowing above a dark dance floor",
    credit: "foldscheap, Wikimedia Commons (CC0)",
  },
  goldHands: {
    src: "/media/stock/gold-lights-hands.jpg",
    width: 1024,
    height: 576,
    alt: "Silhouettes cheering with hands up in front of warm golden stage lights",
    credit: "rawpixel (CC0)",
  },
  danceRed: {
    src: "/media/stock/dance-silhouettes-red.jpg",
    width: 1024,
    height: 683,
    alt: "Silhouettes dancing through red haze on a glossy floor",
    credit: "rawpixel (CC0)",
  },
  lasers: {
    src: "/media/stock/laser-dance.jpg",
    width: 1024,
    height: 682,
    alt: "Partygoers in silhouette under green and pink laser beams",
    credit: "rawpixel (CC0)",
  },
  foosball: {
    src: "/media/stock/foosball.jpg",
    width: 1024,
    height: 768,
    alt: "Close-up of foosball table players and ball",
    credit: "rawpixel (CC0)",
  },
  mocktail: {
    src: "/media/stock/mocktail-mint.jpg",
    width: 1536,
    height: 2048,
    alt: "A chilled lime and mint soda with ice",
    credit: "Enaan Farhan, WordPress Photo Directory (CC0)",
  },
  buffet: {
    src: "/media/stock/buffet-spread.jpg",
    width: 1024,
    height: 724,
    alt: "A long buffet table laid with platters",
    credit: "rawpixel (CC0)",
  },
} satisfies Record<string, StockImage>;

export const MOOD_GALLERY: StockImage[] = [STOCK.crowdBlue, STOCK.danceRed, STOCK.ledCeiling, STOCK.lasers, STOCK.goldHands];

export const MOOD_CAPTION = "Mood reference · licensed stock photo — not Rubarru and not this event";

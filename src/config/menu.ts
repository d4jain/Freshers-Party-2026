/**
 * Food & drinks menu as supplied by the organisers (26 Sep 2026). Item names
 * are kept as given. Photos are illustrative Wikimedia Commons images (see
 * public/media/menu/credits.json) — not the venue's food or drinks.
 *
 * The spirit-type grouping of the bar list is ours, for readability; the
 * brands are exactly the organiser's list.
 */

export type MenuItem = { name: string; image?: string };
export type MenuGroup = {
  title: string;
  /** Indian food-labelling convention: green = veg, red = non-veg. */
  diet?: "veg" | "nonveg";
  image?: string;
  items: MenuItem[];
};

const img = (name: string) => `/media/menu/${name}.jpg`;

export const FOOD_MENU: MenuGroup[] = [
  {
    title: "Veg starters",
    diet: "veg",
    items: [
      { name: "Paneer Tikka", image: img("paneer-tikka") },
      { name: "Pizza Al Verdure", image: img("pizza") },
      { name: "Veg Seekh Kebab", image: img("veg-seekh-kebab") },
    ],
  },
  {
    title: "Non-veg starters",
    diet: "nonveg",
    items: [
      { name: "Chicken Malai Tikka", image: img("chicken-malai-tikka") },
      { name: "Chicken Seekh Kebab", image: img("chicken-seekh-kebab") },
      { name: "Chicken 65", image: img("chicken-65") },
    ],
  },
  {
    title: "Veg main course",
    diet: "veg",
    items: [
      { name: "Dal Makhani", image: img("dal-makhani") },
      { name: "Paneer Lababdar", image: img("paneer-lababdar") },
    ],
  },
  {
    title: "Non-veg main course",
    diet: "nonveg",
    items: [
      { name: "Butter Chicken", image: img("butter-chicken") },
      { name: "Chicken Tikka Masala", image: img("chicken-tikka-masala") },
    ],
  },
  {
    title: "Staples",
    diet: "veg",
    items: [
      { name: "Assorted Bread", image: img("bread") },
      { name: "Pulao", image: img("pulao") },
      { name: "Green Salad", image: img("salad") },
      { name: "Hakka Noodles", image: img("hakka-noodles") },
    ],
  },
  {
    title: "Dessert",
    diet: "veg",
    items: [{ name: "Ice Cream", image: img("ice-cream") }],
  },
];

export const MOCKTAILS: MenuGroup = {
  title: "Mocktails (non-alcoholic)",
  items: [
    { name: "Watermelon Cooler", image: img("watermelon-cooler") },
    { name: "Virgin Mojito", image: img("virgin-mojito") },
    { name: "Blue Lagoon", image: img("blue-lagoon") },
    { name: "Pink Lady", image: img("pink-lady") },
  ],
};

export const BAR: MenuGroup[] = [
  {
    title: "Whisky",
    image: img("whisky"),
    items: [{ name: "Teacher’s Highland" }, { name: "Black Dog Black" }, { name: "100 Pipers" }, { name: "Dewar’s White Label" }],
  },
  { title: "Vodka", image: img("vodka"), items: [{ name: "Smirnoff" }] },
  { title: "Gin", image: img("gin"), items: [{ name: "Blue Moon Indian Dry Gin" }] },
  { title: "Rum", image: img("rum"), items: [{ name: "Bacardi White" }, { name: "Old Monk Dark" }] },
  {
    title: "Beer",
    image: img("beer"),
    items: [
      { name: "Carlsberg Smooth" },
      { name: "Carlsberg Elephant" },
      { name: "Tuborg Classic" },
      { name: "Kingfisher Premium" },
    ],
  },
];

/** Legal drinking age for Uttar Pradesh (Noida). */
export const ALCOHOL_NOTE =
  "Alcoholic drinks are served only to guests of legal drinking age (21+ in Uttar Pradesh). Carry a valid photo ID — the venue may check it.";

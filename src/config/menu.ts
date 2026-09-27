/**
 * Food & drinks menu as supplied by the organisers (26 Sep 2026). Item names
 * are kept as given. Shown as text in the popups on the Experience cards.
 *
 * The spirit-type grouping of the bar list is ours, for readability; the
 * brands are exactly the organiser's list.
 */

export type MenuItem = { name: string };
export type MenuGroup = {
  title: string;
  /** Indian food-labelling convention: green = veg, red = non-veg. */
  diet?: "veg" | "nonveg";
  items: MenuItem[];
};

export const FOOD_MENU: MenuGroup[] = [
  {
    title: "Veg starters",
    diet: "veg",
    items: [{ name: "Paneer Tikka" }, { name: "Pizza Al Verdure" }, { name: "Veg Seekh Kebab" }],
  },
  {
    title: "Non-veg starters",
    diet: "nonveg",
    items: [{ name: "Chicken Malai Tikka" }, { name: "Chicken Seekh Kebab" }, { name: "Chicken 65" }],
  },
  {
    title: "Veg main course",
    diet: "veg",
    items: [{ name: "Dal Makhani" }, { name: "Paneer Lababdar" }],
  },
  {
    title: "Non-veg main course",
    diet: "nonveg",
    items: [{ name: "Butter Chicken" }, { name: "Chicken Tikka Masala" }],
  },
  {
    title: "Staples",
    diet: "veg",
    items: [{ name: "Assorted Bread" }, { name: "Pulao" }, { name: "Green Salad" }, { name: "Hakka Noodles" }],
  },
  {
    title: "Dessert",
    diet: "veg",
    items: [{ name: "Ice Cream" }],
  },
];

export const MOCKTAILS: MenuGroup = {
  title: "Mocktails (non-alcoholic)",
  items: [{ name: "Watermelon Cooler" }, { name: "Virgin Mojito" }, { name: "Blue Lagoon" }, { name: "Pink Lady" }],
};

export const BAR: MenuGroup[] = [
  {
    title: "Whisky",
    items: [{ name: "Teacher’s Highland" }, { name: "Black Dog Black" }, { name: "100 Pipers" }, { name: "Dewar’s White Label" }],
  },
  { title: "Vodka", items: [{ name: "Smirnoff" }] },
  { title: "Gin", items: [{ name: "Blue Moon Indian Dry Gin" }] },
  { title: "Rum", items: [{ name: "Bacardi White" }, { name: "Old Monk Dark" }] },
  {
    title: "Beer",
    items: [
      { name: "Carlsberg Smooth" },
      { name: "Carlsberg Elephant" },
      { name: "Tuborg Classic" },
      { name: "Kingfisher Premium" },
    ],
  },
];


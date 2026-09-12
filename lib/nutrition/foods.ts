/**
 * The Aldi catalogue.
 *
 * Prices are in pounds, per pack, at Aldi UK. The ones marked `verified` were
 * checked against a real listing in September 2026; the rest are honest
 * estimates in the right region. Every price is editable in the app, because a
 * price list that silently goes stale is worse than one you know to check —
 * and the shopping total is only as good as these numbers.
 *
 * `roles` is what makes substitution work. When the athlete says they do not
 * like something, the engine does not look for "a similar food"; it looks for
 * what nutritional job that food was doing and finds the cheapest thing that
 * does the same job.
 */

export type Role =
  | 'protein-lean' | 'protein-red' | 'protein-fish' | 'protein-dairy' | 'protein-plant'
  | 'carb-staple' | 'carb-breakfast' | 'carb-fast' | 'carb-bread'
  | 'fat-added' | 'fat-whole'
  | 'veg' | 'fruit'
  | 'calcium' | 'iron' | 'fibre'
  | 'fuel-sport' | 'flavour' | 'store';

export type Food = {
  key: string;
  name: string;
  aldi: string;
  category: 'protein' | 'carb' | 'fat' | 'veg' | 'fruit' | 'dairy' | 'fuel' | 'store';
  roles: Role[];
  packG: number;          // grams, or ml for liquids
  packPrice: number;      // £
  kcal: number;           // per 100 g
  p: number;
  c: number;
  f: number;
  fibre: number;
  sodium: number;         // mg per 100 g
  perishable: boolean;
  freezable: boolean;
  verified: boolean;
};

const D = '2026-09-12';
export const PRICE_CHECKED = D;

export const FOODS: Food[] = [
  /* ------------------------------------------------------------- protein */
  { key: 'chicken_frozen', name: 'Chicken breast (frozen)', aldi: 'Everyday Essentials Chicken Breast Fillets 1 kg', category: 'protein', roles: ['protein-lean'], packG: 1000, packPrice: 4.25, kcal: 106, p: 24, c: 0, f: 1.2, fibre: 0, sodium: 60, perishable: false, freezable: true, verified: true },
  { key: 'chicken_fresh', name: 'Chicken breast (fresh)', aldi: 'Ashfields British Chicken Breast Fillets 1 kg', category: 'protein', roles: ['protein-lean'], packG: 1000, packPrice: 6.49, kcal: 106, p: 24, c: 0, f: 1.2, fibre: 0, sodium: 60, perishable: true, freezable: true, verified: true },
  { key: 'chicken_thigh', name: 'Chicken thighs, boneless', aldi: 'Ashfields Chicken Thigh Fillets 1 kg', category: 'protein', roles: ['protein-lean'], packG: 1000, packPrice: 4.99, kcal: 150, p: 19, c: 0, f: 8, fibre: 0, sodium: 75, perishable: true, freezable: true, verified: false },
  { key: 'mince_5', name: 'Lean beef mince, 5%', aldi: 'Ashfields 5% Fat Lean Beef Mince 500 g', category: 'protein', roles: ['protein-red', 'iron'], packG: 500, packPrice: 3.49, kcal: 129, p: 21, c: 0, f: 5, fibre: 0, sodium: 70, perishable: true, freezable: true, verified: true },
  { key: 'mince_20', name: 'Beef mince, 20%', aldi: 'Ashfields British Beef Mince 20% Fat 500 g', category: 'protein', roles: ['protein-red', 'iron'], packG: 500, packPrice: 2.49, kcal: 254, p: 18, c: 0, f: 20, fibre: 0, sodium: 70, perishable: true, freezable: true, verified: true },
  { key: 'pork_mince', name: 'Pork mince', aldi: 'Ashfields British Pork Mince 500 g', category: 'protein', roles: ['protein-red'], packG: 500, packPrice: 2.29, kcal: 200, p: 19, c: 0, f: 14, fibre: 0, sodium: 65, perishable: true, freezable: true, verified: false },
  { key: 'gammon', name: 'Gammon joint', aldi: 'Everyday Essentials Unsmoked Gammon Joint ~1 kg', category: 'protein', roles: ['protein-lean'], packG: 1000, packPrice: 4.09, kcal: 140, p: 22, c: 0, f: 6, fibre: 0, sodium: 1100, perishable: true, freezable: true, verified: true },
  { key: 'eggs', name: 'Eggs, medium free range', aldi: 'Merevale British Free Range Medium Eggs, 6', category: 'protein', roles: ['protein-lean', 'fat-whole'], packG: 318, packPrice: 1.45, kcal: 143, p: 12.6, c: 0.7, f: 9.9, fibre: 0, sodium: 124, perishable: true, freezable: false, verified: true },
  { key: 'tuna', name: 'Tuna chunks in brine', aldi: 'Tuna Chunks In Brine 145 g', category: 'protein', roles: ['protein-fish'], packG: 145, packPrice: 0.59, kcal: 99, p: 23, c: 0, f: 0.6, fibre: 0, sodium: 320, perishable: false, freezable: false, verified: true },
  { key: 'salmon_frozen', name: 'Salmon fillets (frozen)', aldi: 'Frozen Salmon Fillets 500 g', category: 'protein', roles: ['protein-fish', 'fat-whole'], packG: 500, packPrice: 4.49, kcal: 200, p: 20, c: 0, f: 13, fibre: 0, sodium: 60, perishable: false, freezable: true, verified: false },
  { key: 'mackerel', name: 'Tinned mackerel in tomato', aldi: 'Tinned Mackerel Fillets 125 g', category: 'protein', roles: ['protein-fish', 'fat-whole'], packG: 125, packPrice: 0.85, kcal: 195, p: 16, c: 2, f: 13, fibre: 0, sodium: 380, perishable: false, freezable: false, verified: false },
  { key: 'bacon', name: 'Back bacon', aldi: 'Everyday Essentials Unsmoked Back Bacon 300 g', category: 'protein', roles: ['protein-red', 'flavour'], packG: 300, packPrice: 1.45, kcal: 215, p: 22, c: 0.5, f: 14, fibre: 0, sodium: 1500, perishable: true, freezable: true, verified: true },
  { key: 'fish_fingers', name: 'Fish fingers', aldi: 'Everyday Essentials Fish Fingers 250 g', category: 'protein', roles: ['protein-fish', 'carb-fast'], packG: 250, packPrice: 0.80, kcal: 200, p: 12, c: 18, f: 9, fibre: 1, sodium: 450, perishable: false, freezable: true, verified: true },
  { key: 'lentils', name: 'Red lentils, dried', aldi: 'Everyday Essentials Red Lentils 500 g', category: 'protein', roles: ['protein-plant', 'fibre', 'iron'], packG: 500, packPrice: 0.99, kcal: 345, p: 24, c: 56, f: 1.5, fibre: 11, sodium: 6, perishable: false, freezable: false, verified: false },
  { key: 'chickpeas', name: 'Chickpeas, tinned', aldi: 'Four Seasons Chickpeas In Water 400 g', category: 'protein', roles: ['protein-plant', 'fibre'], packG: 240, packPrice: 0.49, kcal: 120, p: 7, c: 17, f: 2, fibre: 6, sodium: 240, perishable: false, freezable: false, verified: true },
  { key: 'baked_beans', name: 'Baked beans', aldi: 'Everyday Essentials Baked Beans 420 g', category: 'protein', roles: ['protein-plant', 'fibre', 'carb-staple'], packG: 420, packPrice: 0.28, kcal: 78, p: 4.7, c: 12.5, f: 0.2, fibre: 3.7, sodium: 240, perishable: false, freezable: false, verified: true },
  { key: 'kidney_beans', name: 'Red kidney beans', aldi: 'Everyday Essentials Red Kidney Beans 400 g', category: 'protein', roles: ['protein-plant', 'fibre', 'iron'], packG: 240, packPrice: 0.33, kcal: 100, p: 7, c: 14, f: 0.5, fibre: 6, sodium: 220, perishable: false, freezable: false, verified: true },

  /* --------------------------------------------------------------- dairy */
  { key: 'milk_whole', name: 'Whole milk', aldi: 'Cowbelle British Whole Milk, 4 pints (2.27 L)', category: 'dairy', roles: ['protein-dairy', 'calcium', 'carb-fast'], packG: 2270, packPrice: 1.45, kcal: 64, p: 3.4, c: 4.7, f: 3.6, fibre: 0, sodium: 44, perishable: true, freezable: true, verified: true },
  { key: 'milk_semi', name: 'Semi-skimmed milk', aldi: 'Cowbelle British Semi-Skimmed Milk, 6 pints (3.41 L)', category: 'dairy', roles: ['protein-dairy', 'calcium', 'carb-fast'], packG: 3410, packPrice: 2.15, kcal: 50, p: 3.6, c: 4.8, f: 1.8, fibre: 0, sodium: 44, perishable: true, freezable: true, verified: true },
  { key: 'yoghurt_natural', name: 'Natural yoghurt, fat free', aldi: 'Brooklea Fat Free Natural Yogurt 500 g', category: 'dairy', roles: ['protein-dairy', 'calcium'], packG: 500, packPrice: 0.35, kcal: 57, p: 5.6, c: 7.5, f: 0.1, fibre: 0, sodium: 70, perishable: true, freezable: false, verified: true },
  { key: 'yoghurt_greek', name: 'Greek-style natural yoghurt', aldi: 'Brooklea Greek Style Natural Yogurt 1 kg', category: 'dairy', roles: ['protein-dairy', 'calcium'], packG: 1000, packPrice: 1.85, kcal: 95, p: 4.5, c: 5, f: 6, fibre: 0, sodium: 50, perishable: true, freezable: false, verified: false },
  { key: 'skyr', name: 'High-protein yoghurt', aldi: 'Brooklea Protein Yogurt 450 g', category: 'dairy', roles: ['protein-dairy', 'calcium'], packG: 450, packPrice: 1.45, kcal: 63, p: 10, c: 5, f: 0.2, fibre: 0, sodium: 60, perishable: true, freezable: false, verified: false },
  { key: 'cheddar_grated', name: 'Grated cheddar', aldi: 'Everyday Essentials Grated Cheddar 500 g', category: 'dairy', roles: ['protein-dairy', 'calcium', 'fat-whole', 'flavour'], packG: 500, packPrice: 2.99, kcal: 400, p: 25, c: 0.1, f: 33, fibre: 0, sodium: 650, perishable: true, freezable: true, verified: true },
  { key: 'cottage_cheese', name: 'Cottage cheese', aldi: 'Brooklea Cottage Cheese 300 g', category: 'dairy', roles: ['protein-dairy', 'calcium'], packG: 300, packPrice: 0.95, kcal: 98, p: 12, c: 3.5, f: 4, fibre: 0, sodium: 350, perishable: true, freezable: false, verified: false },
  { key: 'butter', name: 'Butter', aldi: 'Cowbelle British Salted Butter 250 g', category: 'fat', roles: ['fat-added', 'flavour'], packG: 250, packPrice: 1.69, kcal: 744, p: 0.6, c: 0.6, f: 82, fibre: 0, sodium: 700, perishable: true, freezable: true, verified: true },

  /* ---------------------------------------------------------------- carb */
  { key: 'oats', name: 'Porridge oats', aldi: 'Everyday Essentials Porridge Oats 1 kg', category: 'carb', roles: ['carb-breakfast', 'carb-staple', 'fibre'], packG: 1000, packPrice: 0.90, kcal: 366, p: 11, c: 60, f: 8, fibre: 9, sodium: 5, perishable: false, freezable: false, verified: true },
  { key: 'rice_white', name: 'Long grain white rice', aldi: 'Worldwide Long Grain White Rice 1 kg', category: 'carb', roles: ['carb-staple'], packG: 1000, packPrice: 0.52, kcal: 355, p: 7, c: 78, f: 1, fibre: 1.4, sodium: 3, perishable: false, freezable: true, verified: true },
  { key: 'rice_basmati', name: 'Basmati rice', aldi: 'Worldwide Foods Classic Basmati Rice 1 kg', category: 'carb', roles: ['carb-staple'], packG: 1000, packPrice: 1.85, kcal: 350, p: 8, c: 77, f: 1, fibre: 1.5, sodium: 3, perishable: false, freezable: true, verified: true },
  { key: 'pasta', name: 'Penne pasta', aldi: 'Everyday Essentials Penne Pasta 500 g', category: 'carb', roles: ['carb-staple'], packG: 500, packPrice: 0.41, kcal: 352, p: 12, c: 71, f: 1.5, fibre: 3, sodium: 5, perishable: false, freezable: false, verified: true },
  { key: 'spaghetti', name: 'Spaghetti', aldi: 'Everyday Essentials Spaghetti 500 g', category: 'carb', roles: ['carb-staple'], packG: 500, packPrice: 0.28, kcal: 352, p: 12, c: 71, f: 1.5, fibre: 3, sodium: 5, perishable: false, freezable: false, verified: true },
  { key: 'bread_white', name: 'White sliced bread', aldi: 'Village Bakery Medium Sliced White Bread 800 g', category: 'carb', roles: ['carb-bread', 'carb-fast'], packG: 800, packPrice: 0.75, kcal: 235, p: 8, c: 45, f: 1.5, fibre: 2.5, sodium: 450, perishable: true, freezable: true, verified: true },
  { key: 'bread_wholemeal', name: 'Wholemeal sliced bread', aldi: 'Village Bakery Wholemeal Bread 800 g', category: 'carb', roles: ['carb-bread', 'fibre'], packG: 800, packPrice: 0.85, kcal: 225, p: 9.5, c: 38, f: 2.5, fibre: 6.5, sodium: 440, perishable: true, freezable: true, verified: false },
  { key: 'bagels', name: 'Bagels', aldi: 'Village Bakery Plain Bagels, 5', category: 'carb', roles: ['carb-bread', 'carb-fast'], packG: 425, packPrice: 0.99, kcal: 265, p: 9, c: 51, f: 1.5, fibre: 2.5, sodium: 480, perishable: true, freezable: true, verified: false },
  { key: 'wraps', name: 'Tortilla wraps', aldi: 'Village Bakery Tortilla Wraps, 8', category: 'carb', roles: ['carb-bread'], packG: 448, packPrice: 0.89, kcal: 300, p: 8, c: 50, f: 7, fibre: 3, sodium: 600, perishable: true, freezable: true, verified: false },
  { key: 'potatoes', name: 'White potatoes', aldi: "Nature's Pick White Potatoes 2.5 kg", category: 'carb', roles: ['carb-staple', 'veg'], packG: 2500, packPrice: 1.99, kcal: 77, p: 2, c: 17, f: 0.1, fibre: 2.2, sodium: 6, perishable: true, freezable: false, verified: false },
  { key: 'sweet_potato', name: 'Sweet potatoes', aldi: "Nature's Pick Sweet Potatoes 1 kg", category: 'carb', roles: ['carb-staple', 'veg', 'fibre'], packG: 1000, packPrice: 1.35, kcal: 86, p: 1.6, c: 20, f: 0.1, fibre: 3, sodium: 55, perishable: true, freezable: false, verified: false },
  { key: 'chips_frozen', name: 'Oven chips', aldi: 'Four Seasons Straight Cut Chips 1.5 kg', category: 'carb', roles: ['carb-staple'], packG: 1500, packPrice: 1.65, kcal: 162, p: 2.5, c: 26, f: 5, fibre: 2.5, sodium: 30, perishable: false, freezable: true, verified: true },
  { key: 'couscous', name: 'Couscous', aldi: 'Worldwide Foods Couscous 500 g', category: 'carb', roles: ['carb-staple'], packG: 500, packPrice: 0.85, kcal: 355, p: 12, c: 72, f: 1.5, fibre: 5, sodium: 10, perishable: false, freezable: false, verified: false },
  { key: 'cornflakes', name: 'Cornflakes', aldi: 'Harvest Morn Cornflakes 500 g', category: 'carb', roles: ['carb-breakfast', 'carb-fast'], packG: 500, packPrice: 0.75, kcal: 378, p: 7, c: 84, f: 0.9, fibre: 3, sodium: 450, perishable: false, freezable: false, verified: true },
  { key: 'flour_sr', name: 'Self-raising flour', aldi: 'Everyday Essentials Self-Raising Flour 1.5 kg', category: 'carb', roles: ['carb-staple', 'store'], packG: 1500, packPrice: 0.79, kcal: 345, p: 10, c: 71, f: 1.2, fibre: 3, sodium: 400, perishable: false, freezable: false, verified: true },

  /* --------------------------------------------------------- fats & extras */
  { key: 'peanut_butter', name: 'Peanut butter', aldi: 'Grandessa Smooth Peanut Butter 340 g', category: 'fat', roles: ['fat-whole', 'protein-plant'], packG: 340, packPrice: 1.09, kcal: 600, p: 25, c: 12, f: 50, fibre: 6, sodium: 350, perishable: false, freezable: false, verified: true },
  { key: 'oil_veg', name: 'Vegetable oil', aldi: 'Solesta Vegetable Oil 1 L', category: 'fat', roles: ['fat-added'], packG: 1000, packPrice: 1.85, kcal: 828, p: 0, c: 0, f: 92, fibre: 0, sodium: 0, perishable: false, freezable: false, verified: true },
  { key: 'oil_olive', name: 'Olive oil', aldi: 'Solesta Olive Oil 1 L', category: 'fat', roles: ['fat-added'], packG: 1000, packPrice: 4.99, kcal: 824, p: 0, c: 0, f: 91.6, fibre: 0, sodium: 0, perishable: false, freezable: false, verified: false },

  /* ------------------------------------------------------------ veg & fruit */
  { key: 'peas_frozen', name: 'Frozen peas', aldi: 'Four Seasons Garden Peas 1 kg', category: 'veg', roles: ['veg', 'fibre'], packG: 1000, packPrice: 1.19, kcal: 77, p: 5.4, c: 9.5, f: 0.9, fibre: 5.5, sodium: 3, perishable: false, freezable: true, verified: false },
  { key: 'mixed_veg_frozen', name: 'Frozen mixed vegetables', aldi: 'Four Seasons Mixed Vegetables 1 kg', category: 'veg', roles: ['veg', 'fibre'], packG: 1000, packPrice: 1.29, kcal: 48, p: 2.8, c: 6.5, f: 0.5, fibre: 3.5, sodium: 25, perishable: false, freezable: true, verified: false },
  { key: 'broccoli_frozen', name: 'Frozen broccoli', aldi: 'Four Seasons Broccoli Florets 900 g', category: 'veg', roles: ['veg', 'fibre'], packG: 900, packPrice: 1.49, kcal: 30, p: 3, c: 2, f: 0.4, fibre: 3, sodium: 12, perishable: false, freezable: true, verified: false },
  { key: 'sweetcorn_frozen', name: 'Frozen sweetcorn', aldi: 'Four Seasons Sweetcorn 1 kg', category: 'veg', roles: ['veg'], packG: 1000, packPrice: 1.29, kcal: 90, p: 3, c: 17, f: 1.2, fibre: 2.5, sodium: 5, perishable: false, freezable: true, verified: false },
  { key: 'carrots', name: 'Carrots', aldi: "Nature's Pick Carrots 1 kg", category: 'veg', roles: ['veg', 'fibre'], packG: 1000, packPrice: 0.65, kcal: 35, p: 0.7, c: 6, f: 0.3, fibre: 2.8, sodium: 40, perishable: true, freezable: false, verified: true },
  { key: 'onions', name: 'Brown onions', aldi: "Nature's Pick Brown Onions 1 kg", category: 'veg', roles: ['veg', 'flavour'], packG: 1000, packPrice: 0.99, kcal: 38, p: 1.2, c: 7.3, f: 0.2, fibre: 1.4, sodium: 3, perishable: true, freezable: false, verified: true },
  { key: 'mushrooms', name: 'Closed cup mushrooms', aldi: "Nature's Pick Closed Cup Mushrooms 400 g", category: 'veg', roles: ['veg'], packG: 400, packPrice: 1.19, kcal: 22, p: 3.1, c: 0.4, f: 0.5, fibre: 1.1, sodium: 5, perishable: true, freezable: false, verified: true },
  { key: 'peppers', name: 'Mixed peppers', aldi: "Nature's Pick Mixed Peppers, 3", category: 'veg', roles: ['veg'], packG: 480, packPrice: 1.60, kcal: 30, p: 1, c: 5, f: 0.3, fibre: 1.6, sodium: 4, perishable: true, freezable: true, verified: true },
  { key: 'tomatoes_tinned', name: 'Chopped tomatoes', aldi: 'Everyday Essentials Chopped Tomatoes 400 g', category: 'veg', roles: ['veg', 'flavour'], packG: 400, packPrice: 0.35, kcal: 22, p: 1.2, c: 3.5, f: 0.2, fibre: 1, sodium: 10, perishable: false, freezable: false, verified: true },
  { key: 'passata', name: 'Passata', aldi: 'Cucina Passata 500 g', category: 'veg', roles: ['veg', 'flavour'], packG: 500, packPrice: 0.39, kcal: 32, p: 1.4, c: 5.5, f: 0.2, fibre: 1.2, sodium: 15, perishable: false, freezable: false, verified: false },
  { key: 'spinach', name: 'Spinach', aldi: "Nature's Pick Spinach 260 g", category: 'veg', roles: ['veg', 'iron'], packG: 260, packPrice: 0.95, kcal: 25, p: 3, c: 1.6, f: 0.4, fibre: 2.1, sodium: 65, perishable: true, freezable: true, verified: false },
  { key: 'green_beans', name: 'Green beans', aldi: "Nature's Pick Green Beans 220 g", category: 'veg', roles: ['veg', 'fibre'], packG: 220, packPrice: 0.89, kcal: 31, p: 1.8, c: 3.5, f: 0.2, fibre: 2.7, sodium: 6, perishable: true, freezable: true, verified: true },
  { key: 'bananas', name: 'Bananas', aldi: "Nature's Pick Bananas, 5", category: 'fruit', roles: ['fruit', 'carb-fast', 'fuel-sport'], packG: 600, packPrice: 0.78, kcal: 89, p: 1.1, c: 21, f: 0.3, fibre: 2.6, sodium: 1, perishable: true, freezable: false, verified: true },
  { key: 'apples', name: 'Apples', aldi: "Nature's Pick Apples, 6", category: 'fruit', roles: ['fruit', 'fibre'], packG: 780, packPrice: 1.15, kcal: 52, p: 0.3, c: 12, f: 0.2, fibre: 2.4, sodium: 1, perishable: true, freezable: false, verified: false },
  { key: 'oranges', name: 'Oranges', aldi: "Nature's Pick Oranges, 4", category: 'fruit', roles: ['fruit'], packG: 600, packPrice: 1.09, kcal: 47, p: 0.9, c: 9, f: 0.1, fibre: 2.4, sodium: 0, perishable: true, freezable: false, verified: false },
  { key: 'berries_frozen', name: 'Frozen berries', aldi: 'Four Seasons Four Berry Medley 1 kg', category: 'fruit', roles: ['fruit', 'fibre'], packG: 1000, packPrice: 2.99, kcal: 45, p: 0.8, c: 8, f: 0.3, fibre: 3.5, sodium: 2, perishable: false, freezable: true, verified: true },
  { key: 'sultanas', name: 'Sultanas', aldi: 'Everyday Essentials Sultanas 500 g', category: 'fruit', roles: ['fruit', 'carb-fast', 'fuel-sport', 'iron'], packG: 500, packPrice: 1.29, kcal: 300, p: 2.7, c: 69, f: 0.4, fibre: 4, sodium: 10, perishable: false, freezable: false, verified: false },

  /* -------------------------------------------------------------- fuelling */
  { key: 'sugar', name: 'Granulated sugar', aldi: 'Everyday Essentials Granulated Sugar 1 kg', category: 'fuel', roles: ['fuel-sport', 'carb-fast'], packG: 1000, packPrice: 1.09, kcal: 400, p: 0, c: 100, f: 0, fibre: 0, sodium: 0, perishable: false, freezable: false, verified: true },
  { key: 'honey', name: 'Clear honey', aldi: 'Everyday Essentials Clear Honey 340 g', category: 'fuel', roles: ['fuel-sport', 'carb-fast', 'flavour'], packG: 340, packPrice: 0.75, kcal: 320, p: 0.3, c: 79, f: 0, fibre: 0, sodium: 4, perishable: false, freezable: false, verified: true },
  { key: 'jam', name: 'Strawberry jam', aldi: 'Bramwells Strawberry Jam 454 g', category: 'fuel', roles: ['carb-fast', 'flavour'], packG: 454, packPrice: 0.79, kcal: 260, p: 0.4, c: 64, f: 0.1, fibre: 0.8, sodium: 10, perishable: false, freezable: false, verified: false },
  { key: 'malt_loaf', name: 'Malt loaf', aldi: 'Village Bakery Malt Loaf 260 g', category: 'fuel', roles: ['fuel-sport', 'carb-fast'], packG: 260, packPrice: 0.99, kcal: 300, p: 6, c: 62, f: 2, fibre: 3, sodium: 260, perishable: true, freezable: true, verified: false },
  { key: 'flapjack', name: 'Oat bars / flapjacks', aldi: 'Harvest Morn Oat Bars, 6', category: 'fuel', roles: ['fuel-sport', 'carb-fast'], packG: 240, packPrice: 0.89, kcal: 430, p: 5, c: 62, f: 17, fibre: 4, sodium: 130, perishable: false, freezable: false, verified: false },
  { key: 'squash', name: 'Orange squash', aldi: 'Vive Orange Squash 1.5 L', category: 'fuel', roles: ['flavour', 'store'], packG: 1500, packPrice: 0.69, kcal: 10, p: 0, c: 2, f: 0, fibre: 0, sodium: 20, perishable: false, freezable: false, verified: false },
  { key: 'rice_pudding', name: 'Tinned rice pudding', aldi: 'Bramwells Creamed Rice Pudding 400 g', category: 'fuel', roles: ['carb-fast', 'protein-dairy'], packG: 400, packPrice: 0.45, kcal: 90, p: 3, c: 15, f: 2, fibre: 0.2, sodium: 60, perishable: false, freezable: false, verified: false },

  /* ------------------------------------------------------------ store cupboard */
  { key: 'salt', name: 'Table salt', aldi: 'Bramwells Table Salt 750 g', category: 'store', roles: ['store'], packG: 750, packPrice: 0.35, kcal: 0, p: 0, c: 0, f: 0, fibre: 0, sodium: 38000, perishable: false, freezable: false, verified: false },
  { key: 'stock_cubes', name: 'Stock cubes', aldi: 'Quixo Chicken Stock Cubes, 10', category: 'store', roles: ['flavour', 'store'], packG: 100, packPrice: 0.35, kcal: 250, p: 10, c: 20, f: 15, fibre: 0, sodium: 18000, perishable: false, freezable: false, verified: false },
  { key: 'herbs', name: 'Mixed herbs & spices', aldi: 'Stonemill Mixed Herbs', category: 'store', roles: ['flavour', 'store'], packG: 30, packPrice: 0.59, kcal: 250, p: 10, c: 40, f: 5, fibre: 20, sodium: 50, perishable: false, freezable: false, verified: false },
  { key: 'garlic', name: 'Garlic', aldi: "Nature's Pick Garlic, 3", category: 'store', roles: ['flavour', 'store'], packG: 150, packPrice: 0.69, kcal: 149, p: 6, c: 30, f: 0.5, fibre: 2, sodium: 17, perishable: true, freezable: false, verified: false },
  { key: 'soy_sauce', name: 'Soy sauce', aldi: 'Asia Specialities Soy Sauce 150 ml', category: 'store', roles: ['flavour', 'store'], packG: 150, packPrice: 0.69, kcal: 60, p: 8, c: 5, f: 0, fibre: 0, sodium: 5500, perishable: false, freezable: false, verified: false },
];

export const FOOD_BY_KEY = new Map(FOODS.map((f) => [f.key, f]));

/**
 * Price corrections from the database.
 *
 * Composition — the macros — lives in code, because it does not change. Price
 * and pack size do, constantly, so those are overridable and the app asks the
 * athlete to correct them. Set once per request from the `foods` table.
 */
export type PriceOverride = { packG?: number; packPrice?: number; verified?: boolean };
let OVERRIDES: Record<string, PriceOverride> = {};

export function setPriceOverrides(map: Record<string, PriceOverride>): void {
  OVERRIDES = map ?? {};
}

export function food(key: string): Food {
  const base = FOOD_BY_KEY.get(key);
  if (!base) throw new Error(`Unknown food '${key}'`);
  const o = OVERRIDES[key];
  if (!o) return base;
  return {
    ...base,
    packG: o.packG ?? base.packG,
    packPrice: o.packPrice ?? base.packPrice,
    verified: o.verified ?? base.verified,
  };
}

/** Every food, with any price corrections applied. */
export function allFoods(): Food[] {
  return FOODS.map((f) => food(f.key));
}

/**
 * Coarse culinary class, for substitution.
 *
 * Nutritional role alone is not enough. Peanut butter and grated cheddar are
 * both whole-food fat, and swapping one for the other in porridge is a correct
 * answer to the wrong question. A substitute has to make sense on the plate as
 * well as on the spreadsheet.
 */
export function swapClass(f: Food): string {
  if (f.category === 'fat' || f.key === 'peanut_butter') {
    return f.roles.includes('fat-added') ? 'oil' : 'spread';
  }
  if (f.category === 'dairy') {
    if (f.key.startsWith('milk')) return 'milk';
    if (f.key.includes('yoghurt') || f.key === 'skyr' || f.key === 'cottage_cheese') return 'yoghurt';
    return 'cheese';
  }
  if (f.category === 'protein') {
    if (f.roles.includes('protein-fish')) return 'fish';
    if (f.roles.includes('protein-plant')) return 'legume';
    return 'meat';
  }
  if (f.category === 'carb') {
    if (f.roles.includes('carb-bread')) return 'bread';
    if (f.roles.includes('carb-breakfast')) return 'cereal';
    if (['potatoes', 'sweet_potato', 'chips_frozen'].includes(f.key)) return 'tuber';
    return 'grain';
  }
  if (f.category === 'veg') return 'veg';
  if (f.category === 'fruit') return 'fruit';
  if (f.category === 'fuel') return 'sweet';
  return 'store';
}

/** £ per 100 g. */
export function pricePer100(f: Food): number {
  return (f.packPrice / f.packG) * 100;
}

/** £ per 100 kcal — the number that actually decides whether a food is good value. */
export function pricePer100Kcal(f: Food): number {
  return f.kcal > 0 ? (pricePer100(f) / f.kcal) * 100 : Infinity;
}

/** £ per 10 g of protein. */
export function pricePerProtein(f: Food): number {
  return f.p > 0 ? (pricePer100(f) / f.p) * 10 : Infinity;
}

export function macrosFor(f: Food, grams: number) {
  const k = grams / 100;
  return {
    kcal: f.kcal * k,
    p: f.p * k,
    c: f.c * k,
    f: f.f * k,
    fibre: f.fibre * k,
    sodium: f.sodium * k,
    cost: pricePer100(f) * k,
  };
}

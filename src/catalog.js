// What each track's shops sell. Every track has 8 groceries and its own look
// for the three special things (same effect everywhere): something heavy
// (type 'melon': slow steering), something slippery ('oil'), something fragile
// ('eggs'). Balloons are the same on every track. A thing's "look" is the key
// for its name (src/strings.js THING_NAME), its model and its icon.

export const CATALOG = {
  borgo: { goods: ['bread', 'can', 'cheese', 'pasta', 'coffee', 'soda', 'roll', 'detergent'], melon: 'melon', oil: 'oil', eggs: 'eggs' },
  montagna: { goods: ['apple', 'speck', 'cocoa', 'milk', 'ryebread', 'marshmallow', 'firewood', 'cookies'], melon: 'cheesewheel', oil: 'butter', eggs: 'honey' },
  mare: { goods: ['fish', 'shrimp', 'lemon', 'icepop', 'icecream', 'beachball', 'bucket', 'soda'], melon: 'bigmelon', oil: 'suncream', eggs: 'shells' },
  vulcano: { goods: ['banana', 'pineapple', 'mango', 'coconut', 'torch', 'rope', 'map', 'compass'], melon: 'bigcoconut', oil: 'bananapeel', eggs: 'dinoeggs' },
  arcobaleno: { goods: ['rainbowcandy', 'cupcake', 'lollipop', 'cottoncandy', 'starcookie', 'cosmicmilk', 'spacesoda', 'donut'], melon: 'meteor', oil: 'jelly', eggs: 'crystals' },
};
export const catalogOf = (track) => CATALOG[track] || CATALOG.borgo;

/** Height of each grocery in the pile (metres). */
export const GOODS_H = {
  cereal: 0.62, roll: 0.46, can: 0.38, bread: 0.34, cheese: 0.32, soda: 0.56, pineapple: 0.62, detergent: 0.54,
  pasta: 0.42, coffee: 0.36,
  apple: 0.3, speck: 0.3, cocoa: 0.4, milk: 0.56, ryebread: 0.34, marshmallow: 0.4, firewood: 0.36, cookies: 0.3,
  fish: 0.26, shrimp: 0.3, lemon: 0.28, icepop: 0.5, icecream: 0.5, beachball: 0.5, bucket: 0.42,
  banana: 0.3, mango: 0.34, coconut: 0.4, torch: 0.5, rope: 0.3, map: 0.3, compass: 0.22,
  rainbowcandy: 0.3, cupcake: 0.4, lollipop: 0.55, cottoncandy: 0.6, starcookie: 0.22, cosmicmilk: 0.56, spacesoda: 0.5, donut: 0.24,
};

/** The look of a list key ('melon', 'oil', 'eggs' or a grocery) on a track. */
export const lookOfKey = (track, key) => catalogOf(track)[key] || key;
/** The look of a thing { type, goods? } on a track. */
export const lookOf = (track, it) => (it.type === 'goods' ? it.goods : it.type === 'balloon' ? 'balloon' : lookOfKey(track, it.type));

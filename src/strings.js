// Words the game shows for each thing and place (English keys for t()).
export const ITEM_NAME = { goods: 'Groceries', melon: 'Watermelon', balloon: 'Balloons', oil: 'Olive oil', eggs: 'Eggs' };
export const GOODS_NAME = { cereal: 'Cereal', roll: 'Toilet roll', can: 'Tomatoes', bread: 'Bread', cheese: 'Cheese', soda: 'Soda', pineapple: 'Pineapple', detergent: 'Detergent' };
export const ITEM_EFFECT = { melon: 'Heavy: slow to steer', balloon: 'Jump twice to glide', oil: 'Slippery for a while', goods: 'The pile wobbles', eggs: 'Break on bumps' };
export const LEGEND = ['melon', 'balloon', 'oil', 'eggs'];
export const TIPS = {
  melon: 'Watermelon! The cart is heavier and slower to steer.',
  balloon: 'Balloons! Jump, then jump again in the air: you glide a long way. They do not count as extras.',
  oil: 'Olive oil! Slippery for a few seconds.',
  eggs: 'Eggs! They break on hard bumps.',
  goods: 'Steer gently: the pile sways and things fall off.',
};
export const TRACK_NAME = { borgo: 'Old Town', montagna: 'Mountain', mare: 'Sea', vulcano: 'Volcano', arcobaleno: 'Rainbow Road' };
export const CART_NAME = { classic: 'Classic', iron: 'Iron Cart', racer: 'Racer', jumbo: 'Jumbo', rocket: 'Rocket' };
export const SECTION_TOAST = { stairs: 'Stairs!', market: 'Market!', sidewalk: 'Sidewalk!', slope: 'Ski slope!', lake: 'Frozen lake: slippery!', pier: 'Pier: mind the edge!', island: 'Island!', bridge: 'Rope bridge!' };
/** What chases you, for the HUD (the number is the distance). */
export const CHASER_CHIP = {
  dog: 'Dog {n} m behind: drop something!',
  goat: 'Goat {n} m behind: drop something!',
  crab: 'Crab {n} m behind: drop something!',
  gull: 'Gull {n} m behind: it wants your shopping!',
  monkey: 'Monkey {n} m behind: it wants your shopping!',
  snowball: 'Snowball {n} m behind: keep going!',
  boulder: 'Boulder {n} m behind: don\'t stop!',
};
/** How a race ends when you fall (by where you fell) or something runs you over. */
/** What each chaser says when it starts after you, and what is coming at a crossing. */
export const CHASER_TOAST = { dog: 'Woof!', goat: 'Meeeh!', crab: 'Snap snap!', gull: 'Squawk!', monkey: 'Ooh ooh ah ah!' };
export const CROSSING_TOAST = { train: 'Train coming: stop!', plow: 'Snowplow coming: stop!', whale: 'Whale ahead: stop!' };
export const FALL_TITLE = { space: 'Fell off the rainbow!', water: 'Splash! Into the sea!', lava: 'Into the lava!', chasm: 'Fell off the bridge!' };
export const HIT_TITLE = { train: 'Hit by the train!', plow: 'Hit by the snowplow!', whale: 'Swept away by the whale!' };

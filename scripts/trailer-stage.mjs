// The staged race for the trailer: one list, and everything placed on purpose,
// in the order the trailer tells it, one close call after another. Seed 36 has
// street, market and street again for the first ~450 m (no stairs).
export const SEED = 36;
export const STAGE = {
  list: [{ key: 'bread', need: 2 }, { key: 'soda', need: 2 }, { key: 'cereal', need: 2 }, { key: 'melon', need: 1 }],
  things: [
    // 1. grab what is on the list, jump the road works
    { kind: 'item', type: 'goods', goods: 'bread', y: 16, dx: 0 },
    { kind: 'item', type: 'goods', goods: 'soda', y: 25, dx: -1.1 },
    { kind: 'obstacle', type: 'barrier', y: 38, dx: 0 },
    { kind: 'obstacle', type: 'cone', y: 38, dx: -2.4 },
    { kind: 'obstacle', type: 'cone', y: 38, dx: 2.4 },
    { kind: 'item', type: 'goods', goods: 'cereal', y: 47, dx: 0.6 },
    // 2. a dog: something that is not on the list makes a good treat
    { kind: 'item', type: 'goods', goods: 'cheese', y: 55, dx: 0 },
    { kind: 'dog', y: 60, dx: 1, look: 3 },
    { kind: 'pigeons', y: 74, dx: -1.5, n: 5 },
    { kind: 'item', type: 'melon', y: 86, dx: 0.5 },
    // 3. through the red, just ahead of the crowd: the warden runs after you
    { kind: 'light', y: 120, state: 'idle', willRed: true, crowd: 8, lead: 2.8 },
    { kind: 'obstacle', type: 'walker', mode: 'cross', side: -1, speed: 1.8, wake: 14, look: 9, y: 150 },
    { kind: 'item', type: 'goods', goods: 'bread', y: 162, dx: -0.8 },
    { kind: 'obstacle', type: 'bench', y: 178, dx: 0 },
    { kind: 'obstacle', type: 'walker', mode: 'cross', side: 1, speed: 2.0, wake: 14, look: 9, y: 196 },
    { kind: 'item', type: 'goods', goods: 'soda', y: 210, dx: 0.6 },
    // 4. the bells ring late: brake hard, the train goes by right in front
    { kind: 'rail', y: 270, state: 'idle', lead: 2.0 },
    // 5. the last thing on the list, then the sprint to the checkout
    { kind: 'item', type: 'goods', goods: 'cereal', y: 282, dx: -0.4 },
  ],
};

/** What the caption says at this point of the race. */
export function captionFor(g) {
  const y = g.cart.y;
  if (g.won) return '';
  if (g.checkoutY !== null) return 'Sprint to the checkout!';
  if (y < 32) return 'Grab what is on your list!';
  if (y < 46) return 'Jump!';
  if (y < 88) return !g.dogs ? '' : g.dogFed ? 'Snack thrown. Bye, doggy!' : 'Dog! Throw it a snack!';
  if (y < 118) return 'Red light? Go go go!';
  if (y > 255 && y < 271) return g.cart.v > 2 ? 'BRAKE!' : 'Too close!';
  if (g.cop === 'chase') return g.copGap < 1.9 ? 'Don\'t slow down!!' : 'The cop is on your tail!';
  return '';
}

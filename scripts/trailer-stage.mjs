// The staged race for the trailer: one list, and everything placed on purpose,
// in the order the trailer tells it. Seed 36 has street, market and street again
// for the first ~450 m (no stairs).
export const SEED = 36;
export const STAGE = {
  list: [{ key: 'bread', need: 2 }, { key: 'soda', need: 2 }, { key: 'cereal', need: 2 }, { key: 'melon', need: 1 }],
  things: [
    // 1. grab what is on the list
    { kind: 'item', type: 'goods', goods: 'bread', y: 20, dx: 0 },
    { kind: 'item', type: 'goods', goods: 'soda', y: 31, dx: -1.2 },
    { kind: 'item', type: 'goods', goods: 'cereal', y: 42, dx: 0.6 },
    { kind: 'pigeons', y: 52, dx: -1.5, n: 5 },
    // 2. jump the road works
    { kind: 'obstacle', type: 'barrier', y: 68, dx: 0 },
    { kind: 'obstacle', type: 'cone', y: 68, dx: -2.4 },
    { kind: 'obstacle', type: 'cone', y: 68, dx: 2.4 },
    // 3. a dog: something that is not on the list makes a good treat
    { kind: 'item', type: 'goods', goods: 'cheese', y: 84, dx: 0 },
    { kind: 'dog', y: 88, dx: 1, look: 3 },
    { kind: 'item', type: 'melon', y: 122, dx: 0.5 },
    { kind: 'obstacle', type: 'walker', mode: 'cross', side: -1, speed: 1.8, wake: 14, look: 9, y: 140 },
    // 4. stop at the red light while the crowd crosses
    { kind: 'light', y: 172, state: 'idle', willRed: true, crowd: 9 },
    { kind: 'item', type: 'goods', goods: 'bread', y: 190, dx: -0.8 },
    // 5. wait for the train
    { kind: 'rail', y: 250, state: 'idle' },
    // 6. the last things on the list, then the checkout
    { kind: 'item', type: 'goods', goods: 'soda', y: 262, dx: 0.4 },
    { kind: 'item', type: 'goods', goods: 'cereal', y: 273, dx: -0.4 },
  ],
};

/** What the caption says at this point of the race. */
export function captionFor(g) {
  const y = g.cart.y;
  if (g.won) return '';
  if (g.checkoutY !== null) return 'Beat the clock!';
  if (y < 58) return 'Grab what is on your list';
  if (y < 78) return 'Jump the road works!';
  if (y < 112) return g.dogs.length ? 'Feed the dog, lose the dog' : '';
  if (y < 145) return '';
  if (y < 182) return 'Stop at red lights!';
  if (y < 192) return '';
  if (y < 258) return 'Never race a train';
  return '';
}

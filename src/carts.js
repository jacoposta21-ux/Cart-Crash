// The carts in the garage, bought with the coins picked up on the road. Each
// one trades a little of something for something else; the later tracks are
// much easier with an extra life or two.
//   lives: crashes you can take · speed: m/s added to the roll · steer: how
//   quick the steering is · grip: how fast it follows the steering · pile: extra
//   room on top of the pile (metres) · steady: how well the pile stays up.

export const CARTS = {
  classic: { price: 0, lives: 3, speed: 0, steer: 1, grip: 1, pile: 0, steady: 1, colors: { frame: '#c9d1de', grip: '#e63946', base: '#8d96a8' } },
  iron: { price: 150, lives: 4, speed: -0.5, steer: 0.88, grip: 1, pile: 0, steady: 1.25, colors: { frame: '#5c6370', grip: '#ffb703', base: '#3d424c' } },
  racer: { price: 400, lives: 3, speed: 1.2, steer: 1.18, grip: 1.15, pile: 0, steady: 0.95, colors: { frame: '#e63946', grip: '#ffffff', base: '#9d0208' } },
  jumbo: { price: 700, lives: 4, speed: 0, steer: 0.95, grip: 1, pile: 1.6, steady: 1.35, colors: { frame: '#3a86ff', grip: '#ffbe0b', base: '#1d4e89' } },
  rocket: { price: 1500, lives: 5, speed: 1, steer: 1.12, grip: 1.2, pile: 0.8, steady: 1.3, colors: { frame: '#ffd23f', grip: '#8f6bff', base: '#c99700' } },
};

export const CART_ORDER = ['classic', 'iron', 'racer', 'jumbo', 'rocket'];
export const cartOf = (id) => CARTS[id] || CARTS.classic;

// The four tracks, in the order they unlock (finish one to open the next).
// Each one has its own look (theme, sky, light) and its own difficulty: faster,
// busier, curvier, and on the Rainbow Road no walls at all: ride off the edge
// and you fall.

export const TRACKS = {
  borgo: {
    theme: 'town',
    sky: '#a8dcf5', fog: '#d6eef8', fogNear: 45,
    hemi: ['#e6f4ff', '#d9b98f', 1.9], sun: ['#fff1d6', 1.7],
    sections: { street: 3.5, sidewalk: 2, stairs: 2, market: 2 },
    speed: 0, d0: 0, busy: 1, curve: 1, hw: 1,
    lights: true, rails: true, dogs: 1, ice: 0, void: false,
    listSize: 4, bonus: 20, birds: 'pigeon',
  },
  porto: {
    theme: 'harbour',
    sky: '#8fd3f4', fog: '#cfeefb', fogNear: 45,
    hemi: ['#e8f7ff', '#c9b48d', 1.9], sun: ['#fff4dc', 1.75],
    sections: { street: 3.5, sidewalk: 2.5, stairs: 1.5, market: 2.5 },
    speed: 0.8, d0: 0.2, busy: 0.95, curve: 1.15, hw: 1,
    lights: true, rails: true, dogs: 1.6, ice: 0, void: false,
    listSize: 4, bonus: 35, birds: 'gull',
  },
  montagna: {
    theme: 'alpine',
    sky: '#b9d9f2', fog: '#eef5fb', fogNear: 35,
    hemi: ['#f2f8ff', '#cfd9e3', 2.0], sun: ['#ffffff', 1.5],
    sections: { street: 3.5, sidewalk: 2.5, stairs: 2.5, market: 1.5 },
    speed: 1.5, d0: 0.35, busy: 0.95, curve: 1.3, hw: 0.97,
    lights: true, rails: true, dogs: 1.3, ice: 1, void: false,
    listSize: 4, bonus: 55, birds: 'crow',
  },
  arcobaleno: {
    theme: 'rainbow',
    sky: '#140b33', fog: '#2a1458', fogNear: 55,
    hemi: ['#ffffff', '#8a6bd6', 2.3], sun: ['#ffffff', 1.4],
    sections: { street: 4, stairs: 1.5 },
    speed: 2.2, d0: 0.5, busy: 1.05, curve: 1.5, hw: 0.88,
    lights: false, rails: false, dogs: 0, ice: 0, void: true,
    listSize: 4, bonus: 90, birds: null,
  },
};

export const TRACK_ORDER = ['borgo', 'porto', 'montagna', 'arcobaleno'];
export const trackOf = (id) => TRACKS[id] || TRACKS.borgo;

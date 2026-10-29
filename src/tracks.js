// The five tracks, in the order they unlock (finish one to open the next).
// Each one adds something of its own:
//   Old Town   traffic lights and the warden, dogs, the train.
//   Mountain   ski slopes, snowballs rolling after you, ski jumps, a frozen
//              lake, goats, the snowplow.
//   Sea        narrow piers over the water (fall in and you lose a life) from
//              island to island, gaps to jump, waves, crabs, gulls that steal,
//              a giant wave sweeping over the pier.
//   Volcano    a boulder rolling after you all the way, lava rivers to jump,
//              rope bridges, geysers, monkeys that steal.
//   Rainbow    a rainbow in space with no walls at all, turbo arrows and
//              blocks moving from side to side.
//
// sections: how often each kind of stretch comes (src/world.js SECTION).
// speed: m/s added to the roll · d0: how hard it starts (0..1) · busy: spacing
// (lower is busier) · curve: how much the road bends · hw: road width factor.
// lights: kinds of stretch with traffic lights · crossing: what crosses the road
// and where · animal: what chases you · thief: what steals from the pile ·
// roller: what rolls after you · bonus: coins at the checkout · first: coins the
// first time you finish it.

export const TRACKS = {
  borgo: {
    theme: 'town',
    sky: '#a8dcf5', fog: '#d6eef8', fogNear: 45,
    hemi: ['#e6f4ff', '#d9b98f', 1.9], sun: ['#fff1d6', 1.7],
    sections: { street: 3.5, sidewalk: 2, stairs: 2, market: 2 },
    speed: 0, d0: 0, busy: 1, curve: 1, hw: 1,
    lights: ['street', 'market'], crossing: { vehicle: 'train', on: ['street'] },
    animal: 'dog', thief: null, roller: null, void: false, birds: 'pigeon',
    listSize: 4, bonus: 20, first: 100,
  },
  montagna: {
    theme: 'alpine',
    sky: '#9fcdf0', fog: '#e9f3fb', fogNear: 40,
    hemi: ['#f2f8ff', '#cfd9e3', 2.0], sun: ['#ffffff', 1.5],
    sections: { slope: 3.2, street: 2, lake: 1.2, stairs: 1.2 },
    speed: 1.1, d0: 0.3, busy: 0.93, curve: 1.3, hw: 0.95,
    lights: ['street'], crossing: { vehicle: 'plow', on: ['street'] },
    animal: 'goat', thief: null, roller: 'snowball', void: false, birds: 'crow',
    listSize: 4, bonus: 35, first: 200,
  },
  mare: {
    theme: 'sea',
    sky: '#7fd0f5', fog: '#c9eefc', fogNear: 45,
    hemi: ['#ecf9ff', '#bfa983', 1.95], sun: ['#fff6e0', 1.8],
    sections: { pier: 3, island: 2.4 },
    speed: 1.4, d0: 0.35, busy: 0.97, curve: 1.15, hw: 1,
    lights: [], crossing: { vehicle: 'bigwave', on: ['pier'] },
    animal: 'crab', thief: 'gull', roller: null, void: false, birds: 'gull',
    listSize: 4, bonus: 50, first: 300,
  },
  vulcano: {
    theme: 'jungle',
    sky: '#f6b27a', fog: '#f1c79e', fogNear: 40,
    hemi: ['#ffe9d2', '#7a5a3a', 1.9], sun: ['#ffd8a8', 1.6],
    sections: { trail: 3.4, bridge: 1.5, stairs: 1.1 },
    speed: 1.8, d0: 0.4, busy: 0.97, curve: 1.35, hw: 1,
    lights: [], crossing: null,
    animal: null, thief: 'monkey', roller: 'boulder', void: false, birds: null,
    listSize: 4, bonus: 70, first: 400,
  },
  arcobaleno: {
    theme: 'rainbow',
    sky: '#140b33', fog: '#2a1458', fogNear: 55,
    hemi: ['#ffffff', '#8a6bd6', 2.3], sun: ['#ffffff', 1.4],
    sections: { street: 4, stairs: 1.5 },
    speed: 2.2, d0: 0.5, busy: 1.05, curve: 1.5, hw: 0.88,
    lights: [], crossing: null,
    animal: null, thief: null, roller: null, void: true, birds: null,
    listSize: 4, bonus: 90, first: 500,
  },
};

export const TRACK_ORDER = ['borgo', 'montagna', 'mare', 'vulcano', 'arcobaleno'];
export const trackOf = (id) => TRACKS[id] || TRACKS.borgo;

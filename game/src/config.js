// Solmar Bay — every tuning number, colour and name in one place.
// The city is a fixed 3200x2400 world; the renderer scales a camera view of it
// to the window, so no rule below depends on the screen size.
export const WORLD = { width: 3200, height: 2400 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Road centrelines: avenues run north-south, streets east-west. Road width in px. */
export const ROADS = {
  width: 96,
  avenues: [250, 750, 1250, 1750, 2250, 2750],
  streets: [250, 700, 1150, 1600, 2050],
  /** South of this y the ground is beach, then sea. */
  beachY: 2250,
};

export const PLAYER = {
  radius: 14,
  walkSpeed: 240,
  runSpeed: 360,
  health: 100,
  punchDamage: 12,
  punchRange: 34,
  punchCooldown: 0.45,
};

export const PISTOL = {
  damage: 34,
  bulletSpeed: 920,
  range: 520,
  fireCooldown: 0.28,
  startAmmo: 12,
  pickupAmmo: 12,
  spread: 0.03,
};

export const CAR = {
  /** Per-model tuning: length, width, accel, top speed, reverse, grip, health. */
  models: {
    sedan: { length: 48, width: 24, accel: 540, top: 500, reverse: 200, grip: 3.2, health: 100, name: 'Sedan' },
    taxi: { length: 48, width: 24, accel: 520, top: 490, reverse: 200, grip: 3.2, health: 100, name: 'Taxi' },
    sport: { length: 50, width: 24, accel: 720, top: 640, reverse: 220, grip: 4.2, health: 80, name: 'Sport' },
    truck: { length: 62, width: 28, accel: 380, top: 380, reverse: 160, grip: 2.6, health: 160, name: 'Truck' },
    police: { length: 50, width: 24, accel: 640, top: 560, reverse: 220, grip: 3.8, health: 140, name: 'Police' },
    gang: { length: 48, width: 24, accel: 560, top: 510, reverse: 200, grip: 3.4, health: 90, name: 'Gang' },
  },
  /** How close the player must be to steal / enter a car. */
  enterRange: 52,
  /** Damage a crash deals to the car (and a little to the driver) at speed. */
  crashDamageSpeed: 260,
};

export const TRAFFIC = {
  cars: 14,
  speed: 150,
  speedJitter: 40,
  spawnMargin: 700,
};

export const PEDS = {
  count: 26,
  walkSpeed: 55,
  fleeSpeed: 170,
};

export const WANTED = {
  max: 5,
  /** Seconds unseen before one star fades. */
  decaySeconds: 7,
  /** How far police must be to count as "unseen". */
  unseenRange: 560,
  /** Police cars on the road per star (cap) and foot cops per star above 1. */
  carsPerStar: 1,
  maxCars: 4,
  footCopsPerStar: 1,
  /** A cop touching the player this long, while wanted, means BUSTED. */
  bustHoldSeconds: 1.1,
  /** Cash lost when busted / wasted. */
  bustFine: 150,
};

export const POLICE = {
  carTop: 520,
  carAccel: 640,
  footSpeed: 235,
  ramDamage: 8,
  ramCooldown: 1.4,
  sightRange: 620,
};

export const MISSIONS = [
  {
    id: 'first-job',
    title: 'First Job',
    giver: "Sol Reyes",
    briefing: 'Sol needs a driver. Steal any car, then bring it to her garage on Palm Row.',
    payout: 500,
    steps: [
      { type: 'enterCar', text: 'Steal a car — walk up to one and press E' },
      { type: 'goto', place: 'garage', text: "Drive to Sol's Garage" },
    ],
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    giver: "Sol Reyes",
    briefing: 'Three packages are stashed around the city. Collect them all, then deliver to the Marina.',
    payout: 800,
    steps: [
      { type: 'collect', place: 'park', count: 1, text: 'Collect the package in Coral Park (1/3)' },
      { type: 'collect', place: 'beach', count: 1, text: 'Collect the package on the Beach (2/3)' },
      { type: 'collect', place: 'downtown', count: 1, text: 'Collect the package Downtown (3/3)' },
      { type: 'goto', place: 'marina', text: 'Deliver the packages to the Marina' },
    ],
  },
  {
    id: 'getaway',
    title: 'Getaway',
    giver: "Sol Reyes",
    briefing: 'A delivery went loud and the cops are onto you. Lose the heat, then lay low at the Safehouse.',
    payout: 1200,
    wantedOnStart: 2,
    steps: [
      { type: 'loseWanted', text: 'Lose the wanted level — break line of sight and keep moving' },
      { type: 'goto', place: 'safehouse', text: 'Reach the Safehouse' },
    ],
  },
  {
    id: 'payback',
    title: 'Payback',
    giver: "Sol Reyes",
    briefing: "Kane's gang torched Sol's stash. Destroy three of their cars. Watch the heat — shooting draws cops.",
    payout: 1500,
    steps: [
      { type: 'destroy', count: 3, text: 'Destroy Kane gang cars (0/3)' },
    ],
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    giver: "Sol Reyes",
    briefing: "One last job: lift the briefcase from Kane's Casino and get it to the Marina boat. The whole force will be after you.",
    payout: 5000,
    wantedOnPickup: 3,
    steps: [
      { type: 'goto', place: 'casino', text: "Reach Kane's Casino" },
      { type: 'collect', place: 'casino', count: 1, text: 'Grab the briefcase' },
      { type: 'goto', place: 'marina', text: 'Escape to the Marina boat — 3 stars!' },
    ],
  },
];

/** Named places in the city (x, y, radius that counts as "arrived"). Each point
 * sits on open ground by its landmark's front — never inside a building — so
 * a car can always drive up to it. */
export const PLACES = {
  garage: { x: 1000, y: 1990, r: 90, label: "Sol's Garage" },
  park: { x: 1500, y: 925, r: 80, label: 'Coral Park' },
  beach: { x: 2250, y: 2320, r: 90, label: 'Sunset Beach' },
  downtown: { x: 2000, y: 1600, r: 80, label: 'Downtown' },
  marina: { x: 3020, y: 1825, r: 100, label: 'Marina' },
  safehouse: { x: 500, y: 660, r: 90, label: 'Safehouse' },
  casino: { x: 2500, y: 1560, r: 100, label: "Kane's Casino" },
  hospital: { x: 2000, y: 475, r: 90, label: 'Hospital' },
  hotel: { x: 1500, y: 1960, r: 90, label: 'Palm Hotel' },
};

/** Where Jax starts a new game: on open ground south of the Safehouse. */
export const SPAWN = { x: 500, y: 620 };

/** Cash pickup values and spawn rules. */
export const PICKUPS = {
  cashValues: [25, 50, 100],
  healthAmount: 40,
  spawnCount: 10,
};

export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#74a24f',
  sand: '#e8d29a',
  sea: '#2e7f9e',
  seaDeep: '#256b87',
  road: '#3a3f4a',
  roadEdge: '#2c3038',
  roadLine: '#e8d44d',
  sidewalk: '#9aa0a8',
  building: '#b08968',
  buildingRoof: '#8a6a4f',
  buildingAlt: '#7d8aa0',
  buildingAltRoof: '#5d6a7d',
  casino: '#c94f6d',
  casinoRoof: '#8e2f47',
  park: '#5d9c4a',
  tree: '#2f7a3a',
  treeDark: '#256830',
  player: '#ffd23f',
  playerShirt: '#e8503a',
  police: '#2b6cb0',
  policeLight: '#ff3b30',
  gang: '#7a3fa0',
  text: '#f5f1e6',
  muted: '#c9c2ae',
  hudPanel: 'rgba(12, 16, 24, 0.72)',
  marker: '#ffcf3f',
  danger: '#ff4b3e',
  money: '#7ee081',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';

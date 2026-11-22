// Palmera City: Neon Getaway — every tuning number and colour in one place.
// The world is measured in pixels; the camera shows a window of it and the
// renderer scales that window to the canvas, so no rule depends on screen size.

/** The simulation's fixed step, in seconds: 60 updates a second at any refresh rate. */
export const STEP = 1 / 60;

/** World bounds: the city, its promenade and the harbour water to the south. */
export const WORLD = { width: 4864, height: 3584, waterY: 3180 };

/** Road grid: avenues run north-south, streets east-west, centres on these lines. */
export const GRID = {
  avenueX: [320, 832, 1344, 1856, 2368, 2880, 3392, 3904, 4416],
  streetY: [320, 832, 1344, 1856, 2368, 2880],
  promenadeY: 3072,
  roadHalf: 56,
  laneOffset: 27,
};

/** The person on foot. */
export const WALKER = {
  radius: 13,
  walkSpeed: 178,
  sprintSpeed: 292,
  accel: 1500,
  health: 100,
  fistRange: 50,
  fistCooldown: 0.34,
  fistDamage: 34,
};

/** Cars, the player's and everyone else's. */
export const CAR = {
  length: 46,
  width: 23,
  maxSpeed: 660,
  maxReverse: 190,
  accel: 430,
  brake: 760,
  drag: 0.55,
  grip: 7.5,
  handbrakeGrip: 1.6,
  steerMax: 0.62,
  health: 100,
};

/** How many neighbours the city keeps alive at once. */
export const CROWD = { traffic: 16, parked: 30, peds: 36, copsMax: 5 };

/** Wanted heat: crimes add points, stars are hundreds, calm takes them away. */
export const HEAT = {
  perStar: 100,
  max: 500,
  carjack: 30,
  stealParked: 18,
  hitPed: 34,
  downPed: 55,
  shoot: 9,
  hitCop: 26,
  hitCar: 7,
  decayDelay: 6,
  decayRate: 9,
  witnessRange: 330,
};

/** Prices and payouts, in dollars. */
export const MONEY = {
  start: 120,
  pistol: 250,
  ammoPack: 40,
  ammoRounds: 24,
  respray: 150,
  bustFinePerStar: 75,
  bustFineBase: 100,
  wastedBill: 120,
  taxiBase: 25,
};

/** One game minute passes in this many real seconds; a day is 24 game hours. */
export const CLOCK = { secondsPerMinute: 0.9, startHour: 9.5 };

export const SAVE_KEY = 'palmera-neon-getaway.save.v1';

/** Sun-soaked by day, neon by night: the Palmera palette. */
export const PALETTE = {
  grass: '#57a05e',
  grassDark: '#4c9153',
  sand: '#ecd29a',
  sidewalk: '#cfd4d6',
  sidewalkEdge: '#aeb6ba',
  asphalt: '#3d4149',
  asphaltDark: '#34383f',
  laneMark: '#f5d76e',
  crosswalk: '#e8ecee',
  water: '#1d7f96',
  waterDeep: '#166a80',
  waterFoam: '#bfeef2',
  dock: '#8a6f4d',
  roofLight: '#f2e3c9',
  player: '#ffd23f',
  playerTrim: '#26324a',
  copBody: '#20304d',
  copTrim: '#f4f6f8',
  night: '#0d1440',
  text: '#fdfdf8',
  textDark: '#22303c',
  panel: 'rgba(16, 22, 34, 0.78)',
  panelEdge: 'rgba(255, 210, 63, 0.85)',
  accent: '#ffd23f',
  danger: '#ff5252',
  good: '#69e58a',
  cash: '#8be26e',
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
export const FONT_DISPLAY = '"Arial Black", "Trebuchet MS", system-ui, sans-serif';

/** Building name pool: every sign in the city is an original Palmera business. */
export const SHOP_NAMES = [
  'CAFÉ SOL', 'HOTEL MARINA', 'DISCO LUNA', 'BANCO SOL', 'TACOS REY', 'CINE ONDA',
  'PALM MALL', 'GYM BRISA', 'HOTEL FARO', 'CAFÉ OLA', 'PIZZA MAREA', 'LIBROS LUZ',
  'HOTEL CORAL', 'BAR TIBURÓN', 'FLOR DEL SUR', 'MERCADO AZUL', 'CINE BRISA', 'DULCE VIDA',
  'HOTEL PALMA', 'CAFÉ FARO', 'TALLER GOMÉZ', 'JOYAS MAR', 'PAN DEL PUERTO', 'CLUB NEÓN',
];

/** Car paint pool, bright coastal colours plus a few sober ones. */
export const CAR_COLORS = [
  '#e84e4e', '#f28c28', '#ffd23f', '#69b7ff', '#4ecdc4', '#f7f1e1',
  '#95d5b2', '#b388ff', '#ff8fab', '#5a6b7c', '#2f3542', '#eccc68',
];

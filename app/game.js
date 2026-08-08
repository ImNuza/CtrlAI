/* ============================================================
   GARDEN OF LIFE — Game Logic
   Cognitive exercises + garden tending · Mobile-first PWA
   ============================================================ */

'use strict';

/* ── STATE MANAGEMENT ───────────────────────────────────────── */

const STORAGE_KEY = 'garden-of-life-v1';
const SCHEMA_VERSION = 5;

const DEFAULT_STATE = {
  schemaVersion: SCHEMA_VERSION,
  coins: 20,
  streak: 1,
  streakLastDate: null,
  freeSeedDate: null,
  sound: true,
  plants: [],
  ownedSeeds: ['pandan'],
  unlockedMeals: [],
  exerciseHistory: [],
  totalExercises: 0,
  lastVisit: null,
  levelProgress: {},
  streakFreezes: 1,
  recentlyServed: { odd: [], words: [], tiles: [] },
  activeIsland: null,
  shelves: 1,
  stats: {
    plantsWatered: 0, plantsBloomed: 0, plantsRevived: 0, plantsHarvested: 0,
    exercisesCompleted: 0, perfectExercises: 0, levelsReplayed: 0,
    distinctDaysPlayed: 0, monthsPlayed: [], photosShared: 0,
    speciesEverGrown: [], kakiRounds: 0,
  },
  achievements: {},
  achievementQueue: [],
  daily: {
    date: null, tasks: [],
    weekStart: null, weekCompleted: 0, weekClaimed: false,
  },
  absence: { lastStreakBeforeGap: 0, restorePending: false, comebackToday: false, forgivenCount: 0 },
  /* Kopitiam Corner keeps its own little profile: the kakis remember a name and
     a shared history the garden has no use for. Left null until the player first
     sits down, and normalised through adoptKakis() rather than spread from a
     literal here. loadState() shallow-copies DEFAULT_STATE, so a nested object
     written straight into it would be shared with every later mutation. */
  kakis: null,
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.schemaVersion !== SCHEMA_VERSION) {
        return migrateState(parsed);
      }
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch (e) { /* fresh start */ }
  return { ...DEFAULT_STATE };
}

function migrateState(old) {
  const base = { ...DEFAULT_STATE };
  ['coins','streak','streakLastDate','freeSeedDate','sound','plants','ownedSeeds',
   'unlockedMeals','exerciseHistory','totalExercises','lastVisit','levelProgress',
   'streakFreezes','recentlyServed','activeIsland','shelves'].forEach(k => {
    if (old[k] !== undefined) base[k] = old[k];
  });
  /* v3: unlock enough shelves to hold every existing plant, so no progress is lost.
     The floor is a backstop for saves from before shelves existed. A save that
     already carries a count keeps it, because recomputing from plant count
     revoked shelves people had paid for: two plants on two shelves came back as
     one shelf and three lost pots. Harmless while v3 was the only migration to
     run; the v5 bump sends every existing save down this path, so it matters. */
  const shelfFloor = Math.max(1, Math.ceil((base.plants.length || 1) / 3));
  base.shelves = Number.isFinite(old.shelves) && old.shelves >= shelfFloor
    ? Math.floor(old.shelves)
    : shelfFloor;
  // v4 backfill: credit existing players for what they already did
  base.stats = { ...DEFAULT_STATE.stats, ...(old.stats || {}) };
  if (!old.stats) {
    base.stats.exercisesCompleted = old.totalExercises || 0;
    base.stats.plantsBloomed = (old.plants || []).filter(p => p.state === 'bloom').length;
    base.stats.speciesEverGrown = [...new Set((old.plants || []).map(p => p.seedId))];
    base.stats.plantsWatered = (old.plants || []).filter(p => p.wateredAt).length;
  }
  base.achievements = old.achievements || {};
  base.achievementQueue = [];
  base.daily = { ...DEFAULT_STATE.daily };
  base.absence = { ...DEFAULT_STATE.absence };
  // v5: Kopitiam Corner. Carried through raw. adoptKakis() vets every field the
  // first time the player sits down, so a save from any earlier version arrives
  // with an untouched profile rather than a half-built one.
  base.kakis = old.kakis || null;
  if (base.stats.kakiRounds === undefined) base.stats.kakiRounds = 0;
  base.schemaVersion = SCHEMA_VERSION;
  return base;
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

/* ── SHUFFLE — Fisher-Yates ─────────────────────────────────── */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── DATE UTILITIES ─────────────────────────────────────────── */

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dayOffsetStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}

function isNewDay(lastDate) {
  if (!lastDate) return true;
  return todayStr() !== lastDate;
}

/* ── SEED CATALOGUE ─────────────────────────────────────────── */

const SEEDS = [
  { id: 'pandan',    name: 'Pandan Herb',      latin: 'Pandanus amaryllifolius', cost: 0,   rare: false, desc: 'A gentle, calming herb. Perfect for beginners.',     use: 'Pandan leaves are steeped in teas and desserts across Southeast Asia. Their soft vanilla scent is known to calm the mind and settle the stomach.', exerciseType: 'any',     bloomColor: '#73875D', icon: 'icon-leaf' },
  { id: 'sampaguita',name: 'Sampaguita',       latin: 'Jasminum sambac',         cost: 12,  rare: false, desc: 'Fragrant jasmine that rewards daily visits.',         use: 'Jasmine tea made from these blossoms has been used for centuries to ease stress and help with restful sleep. The scent alone lifts the mood.', exerciseType: 'tiles',   bloomColor: '#E07A5F', icon: 'icon-flower' },
  { id: 'fern',      name: 'Memory Fern',      latin: 'Nephrolepis exaltata',    cost: 15,  rare: false, desc: 'An ancient fern that grows with each puzzle solved.', use: 'Ferns quietly clean the air in the home. They are among the oldest plants on earth — older than the dinosaurs.', exerciseType: 'pattern', bloomColor: '#859B6A', icon: 'icon-sprout' },
  { id: 'kopi',      name: 'Coffee Shrub',     latin: 'Coffea liberica',         cost: 18,  rare: false, desc: 'The kopitiam plant. Grows best on company.',          use: 'Liberica is the bean old Singapore kopi is roasted from, dark and thick and taken with a splash of condensed milk. The shrub itself flowers white and smells faintly of jasmine.', exerciseType: 'kakis',   bloomColor: '#7A6B5C', icon: 'icon-kopi' },
  { id: 'hibiscus',  name: 'Hibiscus',         latin: 'Hibiscus rosa-sinensis',  cost: 25,  rare: true,  desc: 'A rare bloom for dedicated gardeners.',             use: 'Hibiscus petals brew a ruby-red tea rich in vitamin C. It is traditionally enjoyed to support heart health and cool the body.', exerciseType: 'oddone',  bloomColor: '#C82A36', icon: 'icon-bloom',  streakRequired: 3 },
  { id: 'orchid',    name: 'Wild Orchid',      latin: 'Vanda miss joaquim',      cost: 30,  rare: true,  desc: 'Elegant and patient, like its gardener.',             use: 'Singapore\'s national flower. Orchids teach patience — they bloom on their own schedule, and are always worth the wait.', exerciseType: 'words',   bloomColor: '#7B5371', icon: 'icon-flower', streakRequired: 3 },
  { id: 'passion',   name: 'Passionfruit Vine',latin: 'Passiflora edulis',       cost: 35,  rare: true,  desc: 'Climbs higher every day you return.',                 use: 'Passionfruit is packed with vitamins A and C and fibre. The vine grows towards the light — a good reminder to do the same.', exerciseType: 'any',     bloomColor: '#E78F37', icon: 'icon-leaf',   streakRequired: 7 },
];

/* ── MEAL CARDS ─────────────────────────────────────────────── */

const MEALS = [
  { id: 'salad',    name: 'Garden Salad',    ingredients: ['pandan', 'sampaguita'],               desc: 'Fresh and light. Good for the eyes and heart.',      icon: 'icon-meal' },
  { id: 'soup',     name: 'Hearty Soup',     ingredients: ['pandan', 'fern'],                     desc: 'Warms the soul. Supports immune health.',               icon: 'icon-meal' },
  { id: 'tea',      name: 'Herbal Tea',      ingredients: ['sampaguita', 'fern'],                 desc: 'Calming and fragrant. A moment of peace.',              icon: 'icon-meal' },
  { id: 'stirfry',  name: 'Garden Stir-fry', ingredients: ['pandan', 'sampaguita', 'fern'],       desc: 'Colourful and nourishing. Good for the whole family.', icon: 'icon-meal' },
  { id: 'cake',     name: 'Pandan Cake',     ingredients: ['pandan', 'hibiscus'],                 desc: 'A celebration treat. Sweet and satisfying.',            icon: 'icon-meal' },
  { id: 'feast',    name: 'Harvest Feast',   ingredients: ['sampaguita', 'fern', 'hibiscus', 'orchid'], desc: 'The ultimate harvest reward. Truly special.',    icon: 'icon-meal' },
  { id: 'kopitoast',name: 'Kopi and Toast',  ingredients: ['kopi', 'pandan'],                     desc: 'The standing order. Kaya on toast, kopi on the side.',  icon: 'icon-meal' },
];

/* ── PLANT SVG GENERATOR ────────────────────────────────────── */

function plantSVG(plant) {
  const s = SEEDS.find(sd => sd.id === plant.seedId) || SEEDS[0];
  const stage = plant.state;
  const bc = s.bloomColor || '#73875D';
  const wilted = stage === 'wilt';
  const grown = stage === 'grown' || stage === 'bloom';
  const bloom = stage === 'bloom';

  const leafHi  = wilted ? '#B1B8A1' : '#B1B8A1';
  const leafMid = wilted ? '#B1B8A1' : '#73875D';
  const leafSh  = wilted ? '#958579' : '#44573D';
  const opacity = wilted ? '0.55' : '1';

  let svg = `<svg viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="${s.name}" role="img">`;
  svg += `<ellipse cx="40" cy="90" rx="28" ry="7" fill="#958579" opacity="0.35"/>`;

  if (stage === 'seed') {
    svg += `<ellipse cx="40" cy="80" rx="10" ry="7" fill="#7A6B5C"/>
            <ellipse cx="40" cy="77" rx="7" ry="5" fill="#B1B8A1" opacity="0.6"/>`;
  } else if (stage === 'sprout' || (wilted && !grown)) {
    svg += `<line x1="40" y1="90" x2="40" y2="${wilted ? '65' : '58'}" stroke="${wilted ? '#958579' : leafMid}" stroke-width="2" stroke-linecap="round"/>
            <ellipse cx="28" cy="62" rx="12" ry="8" fill="${leafHi}" opacity="${opacity}" transform="rotate(-28 28 62)"/>
            <ellipse cx="52" cy="58" rx="12" ry="8" fill="${leafMid}" opacity="${opacity}" transform="rotate(28 52 58)"/>`;
  } else {
    svg += `<line x1="40" y1="90" x2="40" y2="${bloom ? '45' : '52'}" stroke="${leafSh}" stroke-width="2.5" stroke-linecap="round" opacity="${opacity}"/>
            <ellipse cx="22" cy="70" rx="14" ry="9" fill="${leafMid}" opacity="${opacity}" transform="rotate(-22 22 70)"/>
            <ellipse cx="58" cy="66" rx="14" ry="9" fill="${leafSh}" opacity="${opacity}" transform="rotate(20 58 66)"/>
            <ellipse cx="32" cy="56" rx="12" ry="8" fill="${leafHi}" opacity="${opacity}" transform="rotate(-10 32 56)"/>`;
    if (bloom) {
      svg += `<circle cx="40" cy="38" r="12" fill="${bc}" opacity="${wilted ? '0.4' : '0.9'}"/>
              <circle cx="40" cy="38" r="6" fill="${bc}" opacity="0.7"/>
              <circle cx="40" cy="38" r="2.5" fill="#EAE2D0"/>`;
    }
  }
  svg += `</svg>`;
  return svg;
}

/* Field renderer. Identical to plantSVG at every stage except bloom, where it
   draws small hanging fruit instead of the flower disc, a hint that this patch
   is ready to harvest. plantSVG itself stays untouched since it is still the
   renderer for the shop icons and the plant detail modal. */
function plantSVGFruit(plant) {
  const s = SEEDS.find(sd => sd.id === plant.seedId) || SEEDS[0];
  const stage = plant.state;
  const bc = s.bloomColor || '#73875D';
  const wilted = stage === 'wilt';
  const grown = stage === 'grown' || stage === 'bloom';
  const bloom = stage === 'bloom';

  const leafHi  = wilted ? '#B1B8A1' : '#B1B8A1';
  const leafMid = wilted ? '#B1B8A1' : '#73875D';
  const leafSh  = wilted ? '#958579' : '#44573D';
  const opacity = wilted ? '0.55' : '1';

  let svg = `<svg viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="${s.name}" role="img">`;
  svg += `<ellipse cx="40" cy="90" rx="28" ry="7" fill="#958579" opacity="0.35"/>`;

  if (stage === 'seed') {
    svg += `<ellipse cx="40" cy="80" rx="10" ry="7" fill="#7A6B5C"/>
            <ellipse cx="40" cy="77" rx="7" ry="5" fill="#B1B8A1" opacity="0.6"/>`;
  } else if (stage === 'sprout' || (wilted && !grown)) {
    svg += `<line x1="40" y1="90" x2="40" y2="${wilted ? '65' : '58'}" stroke="${wilted ? '#958579' : leafMid}" stroke-width="2" stroke-linecap="round"/>
            <ellipse cx="28" cy="62" rx="12" ry="8" fill="${leafHi}" opacity="${opacity}" transform="rotate(-28 28 62)"/>
            <ellipse cx="52" cy="58" rx="12" ry="8" fill="${leafMid}" opacity="${opacity}" transform="rotate(28 52 58)"/>`;
  } else {
    svg += `<line x1="40" y1="90" x2="40" y2="${bloom ? '45' : '52'}" stroke="${leafSh}" stroke-width="2.5" stroke-linecap="round" opacity="${opacity}"/>
            <ellipse cx="22" cy="70" rx="14" ry="9" fill="${leafMid}" opacity="${opacity}" transform="rotate(-22 22 70)"/>
            <ellipse cx="58" cy="66" rx="14" ry="9" fill="${leafSh}" opacity="${opacity}" transform="rotate(20 58 66)"/>
            <ellipse cx="32" cy="56" rx="12" ry="8" fill="${leafHi}" opacity="${opacity}" transform="rotate(-10 32 56)"/>`;
    if (bloom) {
      svg += `<ellipse cx="35" cy="46" rx="6" ry="5.5" fill="${bc}"/>
              <ellipse cx="45" cy="49" rx="6.5" ry="6" fill="${bc}"/>
              <ellipse cx="40" cy="52" rx="5" ry="5" fill="${bc}"/>`;
    }
  }
  svg += `</svg>`;
  return svg;
}

/* ── STREAK LOGIC ───────────────────────────────────────────── */

function updateStreak() {
  const today = todayStr();
  if (!state.streakLastDate) {
    state.streak = 1;
    state.streakLastDate = today;
  } else if (state.streakLastDate === today) {
    // same day
  } else {
    const diff = daysBetween(state.streakLastDate, today);
    if (diff === 1) {
      state.streak++;
      if (state.streak === 3) {
        showNotif('streak', 'streak3', '3-day streak!', 'Rare seed shelf is now open in the shop.', 'icon-streak');
      } else if (state.streak === 7) {
        showNotif('streak', 'streak7', '7-day streak!', 'The Passionfruit Vine is now available.', 'icon-streak');
      } else if (state.streak === 14) {
        state.streakFreezes++;
        showNotif('streak', 'streak14', '14-day streak!', 'You earned a streak freeze. It will protect you if you miss a day.', 'icon-streak');
      } else if (state.streak > 1) {
        showNotif('info', `streak${state.streak}`, `Day ${state.streak} streak`, 'Your garden loves seeing you every day.', 'icon-streak');
      }
    } else if (diff > 1) {
      // Comeback path — capture pre-gap streak before any reset
      if (diff >= 3) {
        state.absence.lastStreakBeforeGap = state.streak;
        state.absence.restorePending = state.streak >= 3;
        state.absence.comebackToday = true;
        bumpStat('comebacks');
      }
      if (state.streakFreezes > 0 && diff === 2) {
        state.streakFreezes--;
        showNotif('info', 'streak-freeze', 'Streak freeze used', 'You missed a day but your streak is safe. Welcome back.', 'icon-gift');
        state.streakLastDate = today;
      } else {
        state.streak = 1;
      }
    }
    state.streakLastDate = today;
  }
  // Devotion counters — once per calendar day
  if (state.lastVisit !== today) {
    bumpStat('distinctDaysPlayed');
    const month = today.slice(0, 7);
    if (!state.stats.monthsPlayed.includes(month)) {
      state.stats.monthsPlayed.push(month);
      evaluateRecompute();
    }
  }
  evaluateRecompute(); // dev_streak
  saveState();
}

/* ── COMEBACK GRACE ─────────────────────────────────────────── */

/* After 3+ days away every plant would wilt at once. That "catastrophe on
   return" is exactly what the gentle-design floor forbids — an absence is far
   more likely to mean illness or travel than disinterest. Cap the damage: at
   most COMEBACK_MAX_WILT plants are thirsty, the rest kept themselves going.
   Must run BEFORE updatePlantStates() so the capped values are what render. */

const COMEBACK_MAX_WILT = 2;

function applyComebackGrace() {
  if (!state.absence.comebackToday) return;
  const today = todayStr();
  const wilting = state.plants.filter(p => p.wateredAt && daysBetween(p.wateredAt, today) >= 2);
  if (wilting.length <= COMEBACK_MAX_WILT) return;

  const forgiven = wilting.slice(0, wilting.length - COMEBACK_MAX_WILT);
  const yesterday = dayOffsetStr(-1);
  forgiven.forEach(p => { p.wateredAt = yesterday; });
  state.absence.forgivenCount = forgiven.length;
  saveState();
}

/* ── PLANT STATE UPDATER ────────────────────────────────────── */

function updatePlantStates() {
  const today = todayStr();
  const newBlooms = [];
  state.plants.forEach(plant => {
    const prev = plant.state;
    if (!plant.wateredAt) { plant.state = 'seed'; return; }
    const daysSinceWater = daysBetween(plant.wateredAt, today);
    const daysSincePlant = daysBetween(plant.plantedAt, today);
    if (daysSinceWater >= 2) {
      plant.state = 'wilt';
    } else if (daysSincePlant >= 3) {
      plant.state = 'bloom';
    } else if (daysSincePlant >= 1) {
      plant.state = 'grown';
    } else {
      plant.state = 'sprout';
    }
    if (plant.state === 'bloom' && prev !== 'bloom') newBlooms.push(plant);
  });
  newBlooms.forEach(() => {
    bumpStat('plantsBloomed');
    progressTask('s_bloom');
  });
  if (newBlooms.length) evaluateRecompute();
  saveState();
}

/* ── MEAL UNLOCKER ──────────────────────────────────────────── */

function checkMealUnlocks() {
  /* Counts species ever grown, not just those standing right now — otherwise
     harvesting an ingredient would silently lock a meal card away forever. */
  const plantTypes = [...new Set([
    ...state.plants.map(p => p.seedId),
    ...(state.stats.speciesEverGrown || []),
  ])];
  MEALS.forEach(meal => {
    if (state.unlockedMeals.includes(meal.id)) return;
    const hasAll = meal.ingredients.every(ing => plantTypes.includes(ing));
    if (hasAll) {
      state.unlockedMeals.push(meal.id);
      showNotif('success', `meal-${meal.id}`, `Meal card unlocked!`, `${meal.name} — ${meal.desc}`, 'icon-meal');
    }
  });
  evaluateRecompute();
  saveState();
}

/* ════════════════════════════════════════════════════════════
   THE GARDEN ALMANAC — achievements
   ════════════════════════════════════════════════════════════ */

const ACHIEVEMENTS = [
  // Cultivation
  { id: 'cult_water',  cat: 'cultivation', name: 'Faithful Hands',  desc: 'Water your plants regularly.',        metric: 'plantsWatered',   tiers: [{at:10,coins:5},{at:50,coins:15},{at:200,coins:40}] },
  { id: 'cult_bloom',  cat: 'cultivation', name: 'First Light',     desc: 'Bring plants to full bloom.',          metric: 'plantsBloomed',   tiers: [{at:1,coins:8},{at:10,coins:20},{at:30,coins:50}] },
  { id: 'cult_full',   cat: 'cultivation', name: 'Full Shelf',      desc: 'Fill every pot on your shelves at once.', fn: s => s.plants.length >= gardenCapacity() ? 1 : 0, tiers: [{at:1,coins:30}] },
  { id: 'cult_revive', cat: 'cultivation', name: 'Second Chance',   desc: 'Bring thirsty plants back to health.', metric: 'plantsRevived',   tiers: [{at:1,coins:5},{at:10,coins:15},{at:25,coins:35}] },
  { id: 'cult_variety',cat: 'cultivation', name: 'Botanist',        desc: 'Grow different species.',              metric: 'speciesEverGrown',tiers: [{at:3,coins:10},{at:5,coins:25},{at:6,coins:60}] },
  { id: 'cult_harvest',cat: 'cultivation', name: 'Good Harvest',    desc: 'Harvest plants that have bloomed.',    metric: 'plantsHarvested', tiers: [{at:1,coins:8},{at:10,coins:25},{at:30,coins:70}] },
  // Mind
  { id: 'mind_total',  cat: 'mind',        name: 'Sharp as Ever',   desc: 'Complete brain exercises.',            metric: 'exercisesCompleted', tiers: [{at:10,coins:10},{at:50,coins:30},{at:150,coins:75}] },
  { id: 'mind_island', cat: 'mind',        name: 'Meadow Walker',   desc: 'Complete every level on an island.',   fn: s => ISLANDS.filter(i => i.levels.every((_,x) => (s.levelProgress[i.id]||[]).includes(x))).length, tiers: [{at:1,coins:20},{at:2,coins:40},{at:4,coins:100}] },
  { id: 'mind_perfect',cat: 'mind',        name: 'Clear Morning',   desc: 'Finish an exercise with no mistakes.', metric: 'perfectExercises', tiers: [{at:1,coins:10},{at:10,coins:25},{at:30,coins:60}] },
  { id: 'mind_allfour',cat: 'mind',        name: 'Well-Rounded',    desc: 'Try all four exercise types in one day.', metric: 'allFourInOneDay', tiers: [{at:1,coins:25}] },
  { id: 'mind_return', cat: 'mind',        name: 'Practice Makes',  desc: 'Replay a completed level.',            metric: 'levelsReplayed',  tiers: [{at:1,coins:5},{at:10,coins:15}] },
  { id: 'mind_kakis',  cat: 'mind',        name: 'Kopitiam Regular',desc: 'Clear the table with the kakis.',      metric: 'kakiRounds',      tiers: [{at:3,coins:10},{at:10,coins:30},{at:25,coins:70}] },
  // Devotion
  { id: 'dev_streak',  cat: 'devotion',    name: 'Every Morning',   desc: 'Keep a daily streak going.',           fn: s => s.streak,         tiers: [{at:3,coins:15},{at:7,coins:35},{at:30,coins:120}] },
  { id: 'dev_return',  cat: 'devotion',    name: 'Welcome Back',    desc: 'Return after time away.',              metric: 'comebacks',       tiers: [{at:1,coins:20}] },
  { id: 'dev_days',    cat: 'devotion',    name: 'Seasons Passing', desc: 'Play on many different days.',         metric: 'distinctDaysPlayed', tiers: [{at:7,coins:15},{at:30,coins:50},{at:100,coins:150}] },
  { id: 'dev_month',   cat: 'devotion',    name: 'A Year in Flower',desc: 'Play in three different months.',      fn: s => (s.stats.monthsPlayed||[]).length, tiers: [{at:3,coins:80}] },
  // Collection
  { id: 'col_meal',    cat: 'collection',  name: 'Kitchen Garden',  desc: 'Unlock meal cards.',                   fn: s => s.unlockedMeals.length, tiers: [{at:2,coins:15},{at:4,coins:35},{at:6,coins:80}] },
  { id: 'col_seed',    cat: 'collection',  name: 'Seed Keeper',     desc: 'Own different seed varieties.',        fn: s => s.ownedSeeds.length, tiers: [{at:3,coins:10},{at:5,coins:25},{at:6,coins:50}] },
  { id: 'col_rare',    cat: 'collection',  name: 'Rare Bloom',      desc: 'Grow a rare seed to bloom.',           fn: s => new Set(s.plants.filter(p=>p.state==='bloom'&&(SEEDS.find(x=>x.id===p.seedId)||{}).rare).map(p=>p.seedId)).size, tiers: [{at:1,coins:25},{at:3,coins:60}] },
  // Quiet discoveries — hidden until earned
  { id: 'qui_dawn',    cat: 'quiet',       name: 'Dawn Gardener',   desc: 'Tend your garden before 7am.',         metric: 'dawnVisits',      tiers: [{at:1,coins:15}], hidden: true },
  { id: 'qui_dusk',    cat: 'quiet',       name: 'Evening Rounds',  desc: 'Tend your garden after 9pm.',          metric: 'duskVisits',      tiers: [{at:1,coins:15}], hidden: true },
  { id: 'qui_photo',   cat: 'quiet',       name: 'Portrait of a Garden', desc: 'Share a picture of your garden.', metric: 'photosShared',    tiers: [{at:1,coins:20}], hidden: true },
];

const TIER_LABELS = ['Seedling', 'Sprout', 'Bloom'];

function statValue(a, s) {
  if (a.fn) return a.fn(s);
  const v = s.stats[a.metric];
  return Array.isArray(v) ? v.length : (v || 0);
}

function evaluateAchievement(a) {
  const value = statValue(a, state);
  const earned = state.achievements[a.id];
  const earnedTier = earned ? earned.tier : -1;
  for (let t = earnedTier + 1; t < a.tiers.length; t++) {
    if (value >= a.tiers[t].at) {
      state.achievements[a.id] = { tier: t, date: todayStr() };
      queueAward(a, t);
    } else break;
  }
}

function evaluateRecompute() {
  ACHIEVEMENTS.filter(a => a.fn).forEach(evaluateAchievement);
}

function bumpStat(key, by = 1) {
  const cur = state.stats[key] || 0;
  state.stats[key] = cur + by;
  ACHIEVEMENTS.filter(a => a.metric === key).forEach(evaluateAchievement);
  saveState();
}

function queueAward(a, tierIdx) {
  const tier = a.tiers[tierIdx];
  state.coins += tier.coins;
  state.achievementQueue.push({ achId: a.id, tier: tierIdx });
  saveState();
}

function drainAwards() {
  if (!state.achievementQueue.length) return;
  const queue = [...state.achievementQueue];
  state.achievementQueue = [];
  saveState();
  queue.forEach((aw, i) => {
    const a = ACHIEVEMENTS.find(x => x.id === aw.achId);
    if (!a) return;
    setTimeout(() => {
      showNotif('award', `award-${a.id}-${aw.tier}-${Date.now()}`,
        `Almanac: ${a.name} — ${TIER_LABELS[aw.tier]}`,
        `${a.desc} +${a.tiers[aw.tier].coins} coins`,
        'icon-bloom');
      playCoin();
    }, 600 + i * 1200);
  });
}

/* ── DAILY TASKS ────────────────────────────────────────────── */

const GENTLE_POOL = [
  { id: 'g_water1',  text: 'Water one plant',          target: 1, coins: 3 },
  { id: 'g_visit',   text: 'Visit your garden',         target: 1, coins: 3 },
  { id: 'g_look',    text: "Look at a plant's details", target: 1, coins: 3 },
  { id: 'g_shop',    text: 'Browse the seed shop',      target: 1, coins: 3 },
  { id: 'g_almanac', text: 'Open your Almanac',         target: 1, coins: 3 },
];
const CORE_POOL = [
  { id: 'c_ex1',      text: 'Complete one brain exercise', target: 1, coins: 6 },
  { id: 'c_waterall', text: 'Water every plant',           target: 1, coins: 6 },
  { id: 'c_level',    text: 'Finish a level on the path',  target: 1, coins: 6 },
  { id: 'c_tiles',    text: 'Try a Tile Match exercise',   target: 1, coins: 6 },
  { id: 'c_pattern',  text: 'Try a Pattern exercise',      target: 1, coins: 6 },
  { id: 'c_words',    text: 'Try a Word Pairs exercise',   target: 1, coins: 6 },
  { id: 'c_odd',      text: 'Try an Odd One Out exercise', target: 1, coins: 6 },
  { id: 'c_kakis',    text: 'Sit down with the kakis',     target: 1, coins: 6 },
  { id: 'c_revive',   text: 'Bring a thirsty plant back',  target: 1, coins: 8 },
];
const STRETCH_POOL = [
  { id: 's_ex3',      text: 'Complete three exercises',    target: 3, coins: 15 },
  { id: 's_perfect',  text: 'Finish an exercise with no mistakes', target: 1, coins: 15 },
  { id: 's_twotypes', text: 'Try two different exercise types',    target: 2, coins: 12 },
  { id: 's_bloom',    text: 'Bring a plant to bloom',      target: 1, coins: 18 },
  { id: 's_plant',    text: 'Plant a new seed',            target: 1, coins: 12 },
];

function dayHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function taskPossible(id) {
  switch (id) {
    case 'g_water1': case 'c_waterall': case 'c_revive': return state.plants.length > 0;
    case 's_bloom': return state.plants.length > 0;
    default: return true;
  }
}

function rollDailyTasks() {
  const today = todayStr();
  if (state.daily.date === today && state.daily.tasks.length) return;

  const comeback = state.absence.comebackToday;
  const h = dayHash(today + (state.lastVisit || ''));
  const prevTasks = state.daily.tasks || [];

  let pools;
  if (comeback) {
    pools = [GENTLE_POOL, GENTLE_POOL, GENTLE_POOL];
  } else {
    pools = [GENTLE_POOL, CORE_POOL, STRETCH_POOL];
  }

  const used = new Set();
  const tasks = pools.map((pool, pi) => {
    const viable = pool.filter(t => taskPossible(t.id) && !used.has(t.id));
    const finalPool = viable.length ? viable : GENTLE_POOL.filter(t => !used.has(t.id));
    const picked = finalPool[(h >> (pi * 8)) % finalPool.length];
    used.add(picked.id);
    // Carry partial progress if the same task was rolled yesterday
    const prev = prevTasks.find(t => t.id === picked.id);
    const carried = prev && !prev.done ? Math.min(prev.progress, picked.target - 1) : 0;
    return { ...picked, progress: carried, done: carried >= picked.target };
  });

  // Garden Week rollover (Monday)
  const weekStart = mondayStr();
  if (state.daily.weekStart !== weekStart) {
    state.daily.weekStart = weekStart;
    state.daily.weekCompleted = 0;
    state.daily.weekClaimed = false;
  }

  state.daily.date = today;
  state.daily.tasks = tasks;
  saveState();
}

function mondayStr() {
  const d = new Date();
  const day = d.getDay() || 7; // Mon=1..Sun=7
  d.setDate(d.getDate() - day + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function progressTask(...ids) {
  if (!state.daily.tasks) return;
  let changed = false;
  state.daily.tasks.forEach(t => {
    if (!ids.includes(t.id) || t.done) return;
    t.progress++;
    changed = true;
    if (t.progress >= t.target) {
      t.done = true;
      state.coins += t.coins;
      state.daily.weekCompleted++;
      showNotif('success', `task-${t.id}-${todayStr()}`, 'Daily task done!', `${t.text} — +${t.coins} coins`, 'icon-check');
      playCoin();
      checkWeekReward();
    }
  });
  if (changed) { saveState(); updateCoinDisplay(); }
  /* The card is a static host in the menu now, so it can be kept current from
     any screen rather than only while the garden is on show. */
  renderDailyCard();
  updateMenuBadge();
}

function checkWeekReward() {
  if (state.daily.weekCompleted >= 10 && !state.daily.weekClaimed) {
    state.daily.weekClaimed = true;
    const rare = SEEDS.find(s => s.rare && !state.ownedSeeds.includes(s.id));
    if (rare) {
      state.ownedSeeds.push(rare.id);
      if (state.plants.length < gardenCapacity()) plantSeed(rare.id);
      showNotif('rare', 'week-reward', 'Garden Week complete!', `A ${rare.name} seed is yours. Wonderful week.`, 'icon-gift');
    } else {
      state.coins += 50;
      showNotif('rare', 'week-reward', 'Garden Week complete!', '+50 coins. Wonderful week.', 'icon-gift');
    }
    saveState();
  }
}

/* ── NOTIFICATION SYSTEM ────────────────────────────────────── */

function showNotif(type, id, title, body, iconId) {
  const stack = document.getElementById('notification-stack');
  if (stack.querySelector(`[data-notif-id="${id}"]`)) return;

  const el = document.createElement('div');
  el.className = `notif notif-${type}`;
  el.dataset.notifId = id;
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <div class="notif-icon">
      <svg class="icon icon-lg"><use href="#${iconId}"/></svg>
    </div>
    <div class="notif-text">
      <div class="notif-title">${title}</div>
      <div class="notif-body">${body}</div>
    </div>
  `;
  stack.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 350);
  }, 5000);
}

/* ── SOUND ──────────────────────────────────────────────────── */

let audioCtx = null;

function playTone(freq, duration = 0.15, type = 'sine', vol = 0.08) {
  if (!state.sound) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.start(); osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function playSuccess() { playTone(523, 0.15); setTimeout(() => playTone(659, 0.15), 120); setTimeout(() => playTone(784, 0.25), 240); }
function playCoin()    { playTone(880, 0.1); setTimeout(() => playTone(1108, 0.15), 80); }
function playWater()   { playTone(330, 0.2, 'sine', 0.06); }
function playWrong()   { playTone(220, 0.2, 'sine', 0.05); }
function playSelect()  { playTone(440, 0.08, 'sine', 0.04); }

/* ── WATER ANIMATION ────────────────────────────────────────── */

function triggerWaterAnimation(targetPlot) {
  const overlay = document.getElementById('water-overlay');
  overlay.classList.add('active');
  overlay.innerHTML = '';
  const count = targetPlot ? 5 : 20;
  for (let i = 0; i < count; i++) {
    const drop = document.createElement('div');
    drop.className = 'water-drop';
    if (targetPlot) {
      const rect = targetPlot.getBoundingClientRect();
      drop.style.left = `${rect.left + rect.width * 0.3 + Math.random() * rect.width * 0.4}px`;
      drop.style.top = `${rect.top - 20}px`;
    } else {
      drop.style.left = `${Math.random() * 100}%`;
    }
    drop.style.animationDelay = `${Math.random() * 0.4}s`;
    drop.style.animationDuration = `${0.5 + Math.random() * 0.3}s`;
    overlay.appendChild(drop);
  }
  setTimeout(() => { overlay.classList.remove('active'); overlay.innerHTML = ''; }, 1200);
}

/* ── CELEBRATION ────────────────────────────────────────────── */

const CONFETTI_COLORS = ['#73875D', '#859B6A', '#B1B8A1', '#E07A5F', '#E78F37', '#7B5371'];

function triggerCelebration() {
  const overlay = document.getElementById('celebration-overlay');
  overlay.classList.add('active');
  overlay.innerHTML = '';
  for (let i = 0; i < 24; i++) {
    const leaf = document.createElement('div');
    leaf.className = 'confetti-leaf';
    leaf.style.left = `${Math.random() * 100}%`;
    leaf.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    leaf.style.animationDelay = `${Math.random() * 0.8}s`;
    leaf.style.animationDuration = `${1.2 + Math.random() * 0.8}s`;
    leaf.style.width = `${8 + Math.random() * 8}px`;
    leaf.style.height = `${14 + Math.random() * 10}px`;
    overlay.appendChild(leaf);
  }
  setTimeout(() => { overlay.classList.remove('active'); overlay.innerHTML = ''; }, 2200);
}

/* ── NAVIGATION ─────────────────────────────────────────────── */

let currentScreenName = 'garden2';

function showScreen(name, direction) {
  const dir = direction || 'forward';
  const oldScreen = document.querySelector('.screen.active');
  const newScreen = document.getElementById(`screen-${name}`);
  if (!newScreen || oldScreen === newScreen) return;

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    n.setAttribute('aria-selected', 'false');
  });
  const navItem = document.querySelector(`[data-screen="${name}"]`);
  if (navItem) {
    navItem.classList.add('active');
    navItem.setAttribute('aria-selected', 'true');
  }

  // Hide bottom nav during play
  const bottomNav = document.querySelector('.bottom-nav');
  if (name === 'play') {
    bottomNav.style.display = 'none';
  } else {
    bottomNav.style.display = '';
  }

  if (oldScreen) {
    oldScreen.classList.add(`exit-${dir}`);
    setTimeout(() => {
      oldScreen.classList.remove('active', `exit-${dir}`);
      newScreen.classList.add('active', `enter-${dir}`);
      setTimeout(() => newScreen.classList.remove(`enter-${dir}`), 250);
    }, 220);
  } else {
    newScreen.classList.add('active');
  }

  currentScreenName = name;
  if (name === 'garden2') { renderGarden2(); progressTask('g_visit'); }
  if (name === 'exercises') renderExercises();
  if (name === 'shop') { renderShop(); progressTask('g_shop'); }
  if (name === 'profile') renderProfile();
  if (name === 'almanac') { renderAlmanac(); progressTask('g_almanac'); }
}

/* ── GARDEN RENDERER ────────────────────────────────────────── */

/* ── SHELF ECONOMY ────────────────────────────────────────────
   Each shelf holds 4 pots. Shelf 1 free. Costs escalate.
   This is the permanent coin sink: always a next shelf to save for. */

const SHELF_SLOTS = 3;
const SHELF_BASE_COSTS = [0, 60, 150, 300]; // shelf index 0..3

function gardenCapacity() {
  return state.shelves * SHELF_SLOTS;
}

function nextShelfCost() {
  const idx = state.shelves; // cost of the (idx+1)th shelf
  if (idx < SHELF_BASE_COSTS.length) return SHELF_BASE_COSTS[idx];
  return 300 + (idx - SHELF_BASE_COSTS.length + 1) * 150;
}

function buyShelf() {
  const cost = nextShelfCost();
  if (state.coins < cost) return;
  state.coins -= cost;
  state.shelves++;
  saveState();
  updateCoinDisplay();
  playCoin();
  showNotif('success', 'new-shelf', `New land cleared!`, `You now have room for ${gardenCapacity()} plants.`, 'icon-garden');

  renderGarden2();
  // One-shot install animation on the newest shelf
  const units = document.querySelectorAll('#garden2-scene .shelf-unit:not(.shelf-locked-unit)');
  const newest = units[units.length - 1];
  if (newest) {
    newest.classList.add('installed');
    newest.addEventListener('animationend', () => newest.classList.remove('installed'), { once: true });
    // The field no longer scrolls, so bring the new plot into view by panning.
    patchesFieldPan.panIntoView(newest);
  }
}

/* ── GARDEN RENDERER: open field of soil patches ────────────── */

function renderDailyCard() {
  const host = document.getElementById('daily-card');
  if (!host) return;
  rollDailyTasks();
  const tasks = state.daily.tasks || [];
  const allDone = tasks.length > 0 && tasks.every(t => t.done);

  const weekDots = Array.from({ length: 10 }, (_, i) =>
    `<div class="round-dot${i < state.daily.weekCompleted ? ' done' : ''}"></div>`).join('');

  const taskRoute = { g_water1: 'garden2', g_visit: 'garden2', g_look: 'garden2', g_shop: 'shop', g_almanac: 'almanac',
    c_ex1: 'exercises', c_waterall: 'garden2', c_level: 'exercises', c_tiles: 'exercises', c_pattern: 'exercises',
    c_words: 'exercises', c_revive: 'garden2', s_ex3: 'exercises', s_perfect: 'exercises', s_twotypes: 'exercises',
    s_bloom: 'garden2', s_plant: 'shop' };

  host.innerHTML = `
    <div class="daily-card">
      <div class="daily-card-title">
        <svg class="icon" aria-hidden="true"><use href="#icon-sun"/></svg>
        Today in the Garden
      </div>
      ${allDone
        ? `<div class="daily-all-done">All done for today. Lovely work.</div>`
        : `<div class="daily-tasks">
            ${tasks.map(t => `
              <button class="daily-task${t.done ? ' done' : ''}" data-route="${taskRoute[t.id] || 'garden2'}" ${t.done ? 'disabled' : ''}>
                <span class="daily-task-check">
                  ${t.done
                    ? `<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-check"/></svg>`
                    : `<span class="daily-task-circle" aria-hidden="true"></span>`}
                </span>
                <span class="daily-task-text">${t.text}</span>
                <span class="daily-task-meta">
                  ${t.target > 1 ? `<span class="daily-task-progress">${Math.min(t.progress, t.target)}/${t.target}</span>` : ''}
                  <span class="daily-task-coins">
                    <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-coin"/></svg>+${t.coins}
                  </span>
                </span>
              </button>`).join('')}
          </div>`}
      <div class="daily-week">
        <span class="daily-week-label">Garden Week</span>
        <div class="round-tracker daily-week-dots">${weekDots}</div>
        ${state.daily.weekClaimed
          ? `<span class="daily-week-done"><svg class="icon icon-sm" aria-hidden="true"><use href="#icon-gift"/></svg> Reward claimed</span>`
          : `<span class="daily-week-hint">${state.daily.weekCompleted}/10 tasks</span>`}
      </div>
    </div>
  `;

  host.querySelectorAll('.daily-task:not(.done)').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.route;
      closeMenu();
      if (route === 'almanac') showScreen('almanac', 'forward');
      else showScreen(route, 'forward');
    });
  });
}

/* ── MENU ───────────────────────────────────────────────────── */

/* One button in the top bar instead of two, holding today's tasks, the sound
   toggle and sharing. The badge is the only thing that leaks out, so a day's
   tasks are still noticeable without the card taking over the garden. */

function updateMenuBadge() {
  const badge = document.getElementById('menu-badge');
  if (!badge) return;
  const tasks = state.daily.tasks || [];
  badge.hidden = !tasks.some(t => !t.done);
}

function openMenu() {
  const modal = document.getElementById('menu-modal');
  if (!modal) return;
  renderDailyCard();
  updateMenuBadge();
  syncSoundControl();
  modal.hidden = false;
  const menuBtn = document.getElementById('menu-btn');
  if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
  const close = document.getElementById('btn-close-menu');
  if (close) close.focus();
}

function closeMenu() {
  const modal = document.getElementById('menu-modal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  const menuBtn = document.getElementById('menu-btn');
  if (menuBtn) {
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.focus();
  }
  updateMenuBadge();
}

function syncSoundControl() {
  const btn = document.getElementById('mute-btn');
  const icon = document.getElementById('mute-icon');
  const label = document.getElementById('mute-label');
  if (!btn || !icon) return;
  icon.innerHTML = `<use href="#${state.sound ? 'icon-sound' : 'icon-mute'}"/>`;
  if (label) label.textContent = state.sound ? 'Sound is on' : 'Sound is off';
  btn.setAttribute('aria-pressed', String(!state.sound));
  btn.setAttribute('aria-label', state.sound ? 'Turn sound off' : 'Turn sound on');
}

document.getElementById('menu-btn').addEventListener('click', () => {
  const modal = document.getElementById('menu-modal');
  if (modal.hidden) { playSelect(); openMenu(); } else { closeMenu(); }
});

document.getElementById('btn-close-menu').addEventListener('click', closeMenu);

document.getElementById('menu-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeMenu();
});

document.getElementById('menu-modal').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});

/* ── FIELD PAN CAMERA ────────────────────────────────────────
   Both the Garden tab and the Patches tab show the same soil-patch field
   inside a window smaller than the field, so the player drags it under a
   fixed window rather than scrolling the page. createFieldPan() builds one
   independent camera per tab, so createFieldPan() is called once per screen
   below and each keeps its own offset: panning one tab never moves the
   other. This moves the camera only: nothing in the field is dragged, and
   every patch is still opened by an ordinary tap. */

/* Travel from pointerdown that turns a tap into a drag. Small enough that a
   deliberate drag starts immediately, large enough that a shaky finger
   pressing a patch still counts as a tap. */
const PAN_DRAG_THRESHOLD = 9;

function clampPan(value, min, max) {
  return value < min ? min : (value > max ? max : value);
}

/* screenName gates the retry-until-measurable loop and the resize listener
   to when that tab is the one on screen. hintId is optional: the Patches
   tab has no discoverability pill of its own, since the Garden tab already
   teaches the drag-to-look gesture first. */
function createFieldPan(screenName, viewportId, fieldId, hintId, opts = {}) {
  const pan = { x: 0, y: 0, minX: 0, minY: 0, maxX: 0 };
  let bound = false;
  let hintDone = false;
  let measureTimer = 0;
  let centered = false;

  function apply() {
    const field = document.getElementById(fieldId);
    if (field) field.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0)`;
  }

  function hasSlack() {
    return pan.minX < 0 || pan.minY < 0;
  }

  function hideHint() {
    const hint = hintId && document.getElementById(hintId);
    if (!hint || hint.hidden) return;
    hintDone = true;
    hint.classList.add('fading');
    window.setTimeout(() => { hint.hidden = true; hint.classList.remove('fading'); }, 400);
  }

  function maybeShowHint() {
    const hint = hintId && document.getElementById(hintId);
    if (!hint || hintDone || !hasSlack()) return;
    hintDone = true;
    hint.hidden = false;
    window.setTimeout(hideHint, 5000);
  }

  /* Recomputed after every render, because the field grows as land is
     cleared. The current offset is re-clamped rather than reset, so tending
     a plant does not throw the view back to the corner. */
  function measure() {
    const viewport = document.getElementById(viewportId);
    const field = document.getElementById(fieldId);
    if (!viewport || !field) return;
    window.clearTimeout(measureTimer);
    /* render*() runs while the screen transition still has the tab hidden,
       and a hidden element measures zero. Clamping against that phantom size
       would snap the view to the corner, so wait for the transition instead. */
    if (viewport.clientWidth === 0 || field.offsetWidth === 0) {
      if (currentScreenName === screenName) measureTimer = window.setTimeout(measure, 280);
      return;
    }
    const slackX = field.offsetWidth - viewport.clientWidth;
    const slackY = field.offsetHeight - viewport.clientHeight;
    pan.minX = slackX > 0 ? -slackX : 0;
    pan.minY = slackY > 0 ? -slackY : 0;

    /* First measurement only: rest with the first patch centered instead of
       flush against the corner, so there is slack to drag it either way
       rather than starting pinned against a wall on one side. maxX moves out
       to that centered offset so it is actually reachable (it defaults to 0,
       which is the flush-left position) and becomes the new right-hand wall.
       Later measurements (after planting, watering, clearing land) keep
       whatever offset the player left it at, same as before. */
    if (opts.centerFirst && !centered && field.firstElementChild) {
      centered = true;
      const vp = viewport.getBoundingClientRect();
      const box = field.firstElementChild.getBoundingClientRect();
      const centerX = pan.x + (vp.left + vp.width / 2) - (box.left + box.width / 2);
      pan.maxX = Math.max(0, centerX);
      pan.x = clampPan(centerX, pan.minX, pan.maxX);
    } else {
      pan.x = clampPan(pan.x, pan.minX, pan.maxX);
    }
    pan.y = clampPan(pan.y, pan.minY, 0);
    apply();
    maybeShowHint();
  }

  /* Used after clearing new land, in place of the scroll the field no longer
     does. Rects are measured after the transform, so the move is expressed as
     a delta from where the element currently sits. */
  function panIntoView(el) {
    const viewport = document.getElementById(viewportId);
    const field = document.getElementById(fieldId);
    if (!viewport || !field || !el) return;
    measure();
    const vp = viewport.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const wantX = pan.x + (vp.left + vp.width / 2) - (box.left + box.width / 2);
    const wantY = pan.y + (vp.top + vp.height / 2) - (box.top + box.height / 2);
    pan.x = clampPan(wantX, pan.minX, pan.maxX);
    pan.y = clampPan(wantY, pan.minY, 0);
    field.classList.add('pan-glide');
    apply();
    window.setTimeout(() => field.classList.remove('pan-glide'), 500);
  }

  function bind() {
    const viewport = document.getElementById(viewportId);
    if (!viewport || bound) return;
    bound = true;

    let activeId = null;
    let startX = 0, startY = 0, originX = 0, originY = 0;
    let dragged = false;

    /* A drag ends with the browser firing a click on whatever button was under
       the finger. One capture-phase listener on the window swallows exactly that
       click, wherever it lands. The timeout is the safety net for the touch case
       where no click follows at all, so a stale eater can never take the next
       real tap. */
    function swallowNextClick() {
      let timer = 0;
      const clear = () => {
        window.removeEventListener('click', eat, true);
        window.clearTimeout(timer);
      };
      function eat(e) {
        e.stopPropagation();
        e.preventDefault();
        clear();
      }
      window.addEventListener('click', eat, true);
      timer = window.setTimeout(clear, 400);
    }

    viewport.addEventListener('pointerdown', (e) => {
      if (activeId !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      activeId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      originX = pan.x;
      originY = pan.y;
      dragged = false;
      /* Capture is taken later, not here. While a pointer is captured the click
         that follows pointerup is delivered to the capturing element instead of
         the button under the finger, which would swallow every ordinary tap. */
    });

    viewport.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activeId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragged) {
        if (Math.sqrt(dx * dx + dy * dy) < PAN_DRAG_THRESHOLD) return;
        dragged = true;
        viewport.classList.add('panning');
        hideHint();
        /* Now that it is a drag and not a tap, capture keeps the moves coming
           even if the finger leaves the window. The click it retargets is the
           one swallowNextClick() is about to eat anyway. */
        try { viewport.setPointerCapture(activeId); } catch (err) { /* drag still tracked without it */ }
      }
      e.preventDefault();
      pan.x = clampPan(originX + dx, pan.minX, pan.maxX);
      pan.y = clampPan(originY + dy, pan.minY, 0);
      apply();
    });

    function endPan(e) {
      if (e.pointerId !== activeId) return;
      try {
        if (viewport.hasPointerCapture(activeId)) viewport.releasePointerCapture(activeId);
      } catch (err) { /* nothing to release */ }
      activeId = null;
      viewport.classList.remove('panning');
      if (dragged) swallowNextClick();
      dragged = false;
    }

    viewport.addEventListener('pointerup', endPan);
    viewport.addEventListener('pointercancel', endPan);
    /* Fallback for the case where the pointer is released off the viewport
       before the drag threshold was crossed, so nothing was captured yet.
       Without it the gesture would stay open and block the next drag. */
    window.addEventListener('pointerup', endPan);
    window.addEventListener('pointercancel', endPan);

    window.addEventListener('resize', () => {
      if (currentScreenName === screenName) measure();
    });
  }

  return { pan, bind, measure, panIntoView, hasSlack };
}

const patchesFieldPan = createFieldPan('garden2', 'garden2-viewport', 'garden2-scene', null, { centerFirst: true });

/* The function and data names below still say shelf, because state.shelves,
   SHELF_SLOTS and gardenCapacity() are the saved model and renaming them
   would break every existing save. What the player sees and hears is a row
   of soil patches in an open field. */

/* One soil patch, filled or bare. Shared by both tabs' rows via buildShelf,
   which forwards its own opts straight through, so both read the same
   state.plants array through the same click behaviour instead of two
   diverging implementations.

   opts lets renderGarden2 swap in Patches-tab-only tap behaviour on every
   plot in its rows, while renderGarden's rows keep the default behaviour by
   calling buildShelf with no opts at all:
     - onEmptyTap(plantIdx): replaces the default "go to Shop" tap on a bare patch.
     - onBloomTap(plantIdx): replaces openPlantDetail for a patch whose plant
       has reached full bloom (other filled states still open the detail modal).
     - plantRenderer(plant): replaces plantSVG for drawing the filled patch. */
function buildPlot(plantIdx, opts = {}) {
  const { onEmptyTap, onBloomTap, plantRenderer } = opts;
  const plant = state.plants[plantIdx];
  const plot = document.createElement('button');
  plot.className = 'shelf-plot';
  plot.setAttribute('aria-label', plant
    ? `${SEEDS.find(sd => sd.id === plant.seedId)?.name || 'Plant'}, ${plant.state}${plant.state === 'bloom' && onBloomTap ? ', tap to harvest' : ''}`
    : (onEmptyTap ? 'Bare patch of soil, tap to choose a seed to plant' : 'Bare patch of soil, visit the shop to plant'));

  plot.dataset.plantIdx = String(plantIdx);
  plot.dataset.filled = plant ? '1' : '0';

  if (plant) {
    const isThirsty = plant.state === 'wilt';
    plot.classList.add('has-plant');
    if (isThirsty) plot.classList.add('thirsty');
    const renderer = plantRenderer || plantSVG;
    plot.innerHTML = `<div class="plot-plant" aria-hidden="true">${renderer(plant)}</div><div class="plot-pot" aria-hidden="true"></div>`;
    const tap = () => {
      if (plant.state === 'bloom' && onBloomTap) onBloomTap(plantIdx);
      else openPlantDetail(plantIdx);
    };
    plot.addEventListener('click', tap);
    plot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); }
    });
  } else {
    plot.innerHTML = `<div class="plot-pot empty" aria-hidden="true"></div>`;
    const tap = () => {
      if (onEmptyTap) onEmptyTap(plantIdx);
      else showScreen('shop');
    };
    plot.addEventListener('click', tap);
    plot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); }
    });
  }
  return plot;
}

/* opts is threaded straight through to buildPlot() so a caller (currently
   only renderGarden2) can swap in Patches-tab-only tap behaviour on every
   plot in the row without buildShelf needing to know what that behaviour is. */
function buildShelf(shelfIdx, opts = {}) {
  const unit = document.createElement('div');
  unit.className = 'shelf-unit';
  unit.setAttribute('role', 'group');
  unit.setAttribute('aria-label', `Garden row ${shelfIdx + 1}`);

  const pots = document.createElement('div');
  pots.className = 'shelf-pots';

  for (let slot = 0; slot < SHELF_SLOTS; slot++) {
    const plantIdx = shelfIdx * SHELF_SLOTS + slot;
    pots.appendChild(buildPlot(plantIdx, opts));
  }

  unit.appendChild(pots);
  return unit;
}

/* ── PATCHES VIEW — the garden screen ───────────────────────────
   Tapping a bare patch opens the in-place seed menu rather than sending the
   player to the Shop tab, and a bloom is harvested where it stands rather
   than opening the detail panel. Filled patches still open the detail panel,
   which is where a single plant is watered.

   The id names below still say garden2, and buildShelf()/buildLockedShelf()
   still say shelf, because both predate this becoming the only garden view.
   Renaming them would touch the saved model (state.shelves, SHELF_SLOTS),
   so the names stay and this comment carries the meaning. */
function renderGarden2() {
  updatePlantStates();
  const scene = document.getElementById('garden2-scene');
  if (!scene) return;
  scene.innerHTML = '';

  const dateEl = document.getElementById('garden-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-SG',
      { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  /* Today's tasks live in the menu, so the field itself is just the field.
     The badge on the menu button is what says there is something waiting. */
  renderDailyCard();
  updateMenuBadge();

  /* First-visit hint, stacked rather than a side-by-side strip: above the pan
     window the card has the full width but no vertical room to spare. */
  const hintSlot = document.getElementById('garden-hint-slot');
  if (hintSlot) {
    hintSlot.innerHTML = '';
    if (state.plants.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'garden-hint-card';
      hint.innerHTML = `
        <div class="garden-hint-head">
          <svg class="icon icon-lg" aria-hidden="true"><use href="#icon-seed"/></svg>
          <div class="garden-hint-title">Start by planting a seed</div>
        </div>
        <div class="garden-hint-body">Do a brain exercise to earn coins, then visit the shop to buy your first seed.</div>
        <button class="btn btn-primary btn-sm" id="btn-hint-exercise">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-brain"/></svg>
          Do an exercise
        </button>
      `;
      hintSlot.appendChild(hint);
      document.getElementById('btn-hint-exercise')
        .addEventListener('click', () => showScreen('exercises'));
    }
  }

  const patchOpts = { onEmptyTap: openSeedMenu, onBloomTap: harvestPlant, plantRenderer: plantSVGFruit };
  for (let s = 0; s < state.shelves; s++) {
    scene.appendChild(buildShelf(s, patchOpts));
  }
  // The untilled plot at the end, always there so there is always a goal
  scene.appendChild(buildLockedShelf());

  patchesFieldPan.bind();
  patchesFieldPan.measure();

  const waterBtn = document.getElementById('btn-water-all');
  if (waterBtn) {
    const hasThirsty = state.plants.some(p => p.state === 'wilt');
    waterBtn.disabled = state.plants.length === 0;
    waterBtn.innerHTML = hasThirsty
      ? `<svg class="icon" aria-hidden="true"><use href="#icon-water"/></svg> Water thirsty plants`
      : `<svg class="icon" aria-hidden="true"><use href="#icon-water"/></svg> Water all plants`;
  }

  updateCoinDisplay();
}

function buildLockedShelf() {
  const cost = nextShelfCost();
  const canAfford = state.coins >= cost;

  const unit = document.createElement('div');
  unit.className = 'shelf-unit shelf-locked-unit';

  /* Untilled ground at the end of the field. This one stays tappable from
     anywhere, unlike the planting patches, so the class name the dock
     measurement and the floor exemption both key off must not change. */
  const btn = document.createElement('button');
  btn.className = 'shelf-locked-plank';
  btn.disabled = !canAfford;
  btn.setAttribute('aria-label', canAfford
    ? `Clear a new row of land for ${cost} coins`
    : `A new row of land costs ${cost} coins, you have ${state.coins}`);
  btn.innerHTML = `
    <div class="patch-locked-row" aria-hidden="true">
      <span class="patch-locked-slot"></span>
      <span class="patch-locked-slot"></span>
      <span class="patch-locked-slot"></span>
    </div>
    <div class="shelf-tag${canAfford ? ' affordable' : ''}">
      <svg class="icon" aria-hidden="true"><use href="#icon-garden"/></svg>
      <span class="shelf-tag-text">Clear new land</span>
      <span class="shelf-tag-price">
        <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-coin"/></svg>
        ${cost}
      </span>
    </div>
    ${!canAfford ? `<div class="shelf-tag-hint">Earn ${cost - state.coins} more coins</div>` : ''}
  `;

  if (canAfford) {
    btn.addEventListener('click', () => {
      playSelect();
      buyShelf();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); buyShelf(); }
    });
  }

  unit.appendChild(btn);
  return unit;
}

/* ── PLANT DETAIL PANEL ─────────────────────────────────────── */

const PLANT_STATE_LABELS = {
  seed:   'Just planted',
  sprout: 'Sprouting',
  grown:  'Growing well',
  bloom:  'In full bloom',
  wilt:   'Thirsty',
};

let detailPlantIdx = null;

function openPlantDetail(index) {
  const plant = state.plants[index];
  if (!plant) return;
  detailPlantIdx = index;
  progressTask('g_look');
  const seed = SEEDS.find(s => s.id === plant.seedId) || SEEDS[0];
  const ageDays = daysBetween(plant.plantedAt, todayStr());
  const meals = MEALS.filter(m => m.ingredients.includes(plant.seedId));

  const overlay = document.getElementById('plant-detail-modal');
  overlay.innerHTML = `
    <div class="modal-sheet plant-detail-sheet" role="document">
      <div class="modal-header">
        <div>
          <h2 class="modal-title">${seed.name}</h2>
          <div class="plant-latin">${seed.latin}</div>
        </div>
        <button class="icon-btn" id="btn-close-plant" aria-label="Close">
          <svg class="icon" aria-hidden="true"><use href="#icon-close"/></svg>
        </button>
      </div>

      <button class="plant-detail-figure" id="btn-plant-touch" aria-label="Touch the plant gently">
        <div class="plant-detail-svg" id="plant-detail-svg">${plantSVG(plant)}</div>
        <div class="plot-pot" aria-hidden="true"></div>
        <span class="plant-touch-hint">Tap the plant to say hello</span>
      </button>

      <div class="plant-detail-stats">
        <span class="plant-state-badge state-${plant.state}">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-${plant.state === 'wilt' ? 'water' : plant.state === 'bloom' ? 'bloom' : 'sprout'}"/></svg>
          ${PLANT_STATE_LABELS[plant.state] || plant.state}
        </span>
        <span class="plant-age">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-clock"/></svg>
          ${ageDays === 0 ? 'Planted today' : `${ageDays} day${ageDays > 1 ? 's' : ''} old`}
        </span>
      </div>

      <div class="plant-use-card">
        <div class="plant-use-title">
          <svg class="icon" aria-hidden="true"><use href="#icon-book"/></svg>
          Good to know
        </div>
        <p class="plant-use-text">${seed.use}</p>
      </div>

      ${meals.length ? `
      <div class="plant-meals-row">
        ${meals.map(m => `<span class="plant-meal-chip">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-meal"/></svg>
          ${m.name}
        </span>`).join('')}
      </div>` : ''}

      <div class="modal-actions">
        <button class="btn btn-primary btn-lg" id="btn-detail-water">
          <svg class="icon" aria-hidden="true"><use href="#icon-water"/></svg>
          Water this plant
        </button>
        ${plant.state === 'bloom' ? `
        <button class="btn btn-secondary" id="btn-detail-harvest">
          <svg class="icon" aria-hidden="true"><use href="#icon-meal"/></svg>
          Harvest for ${harvestValue(seed)} coins
        </button>
        <div class="harvest-confirm" id="harvest-confirm" hidden>
          <p class="harvest-confirm-text">
            Harvesting lifts ${seed.name} out of the ground and frees its patch.
            You keep any meal cards it unlocked.
          </p>
          <div class="harvest-confirm-actions">
            <button class="btn btn-secondary btn-sm" id="btn-harvest-cancel">Keep it growing</button>
            <button class="btn btn-primary btn-sm" id="btn-harvest-yes">Yes, harvest</button>
          </div>
        </div>` : ''}
      </div>
    </div>
  `;

  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('open'));

  document.getElementById('btn-close-plant').addEventListener('click', closePlantDetail);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePlantDetail(); });
  document.getElementById('btn-detail-water').addEventListener('click', () => {
    closePlantDetail();
    waterPlant(index, null);
  });
  const harvestBtn = document.getElementById('btn-detail-harvest');
  if (harvestBtn) {
    const confirmBox = document.getElementById('harvest-confirm');
    harvestBtn.addEventListener('click', () => {
      harvestBtn.hidden = true;
      confirmBox.hidden = false;
      document.getElementById('btn-harvest-cancel').focus();
      playSelect();
    });
    document.getElementById('btn-harvest-cancel').addEventListener('click', () => {
      confirmBox.hidden = true;
      harvestBtn.hidden = false;
      harvestBtn.focus();
    });
    document.getElementById('btn-harvest-yes').addEventListener('click', () => {
      closePlantDetail();
      harvestPlant(index);
    });
  }

  document.getElementById('btn-plant-touch').addEventListener('click', () => {
    const fig = document.getElementById('plant-detail-svg');
    fig.classList.remove('wiggle');
    void fig.offsetWidth; // restart animation
    fig.classList.add('wiggle');
    playTone(392, 0.12, 'sine', 0.05);
    setTimeout(() => playTone(494, 0.15, 'sine', 0.04), 90);
    if (navigator.vibrate) navigator.vibrate(10);
  });

  // Keyboard: Escape to close
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePlantDetail();
  });
  document.getElementById('btn-close-plant').focus();
}

function closePlantDetail() {
  const overlay = document.getElementById('plant-detail-modal');
  overlay.classList.remove('open');
  detailPlantIdx = null;
  setTimeout(() => { overlay.hidden = true; overlay.innerHTML = ''; }, 250);
}

/* ── SEED MENU (Patches tab: tap an empty patch to plant in place) ──────
   Opens over the Patches grid instead of navigating to the Shop tab. Mirrors
   renderShop()'s per-seed markup and owned/locked/full/afford states so it
   reads as the same shop, just surfaced in place. Buying reuses buySeed()
   as-is: it already handles the coin deduction, capacity check, ownedSeeds
   tracking, notification and save. */

function openSeedMenu(plantIdx) {
  const overlay = document.getElementById('seed-menu-modal');
  overlay.innerHTML = `
    <div class="modal-sheet" role="document">
      <div class="modal-header">
        <h2 class="modal-title">Choose a seed to plant</h2>
        <button class="icon-btn" id="btn-close-seed-menu" aria-label="Close">
          <svg class="icon" aria-hidden="true"><use href="#icon-close"/></svg>
        </button>
      </div>
      <div class="shop-grid" id="seed-menu-list" style="display:flex;flex-direction:column;gap:0.75rem"></div>
    </div>
  `;

  renderSeedMenuList();

  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('open'));

  document.getElementById('btn-close-seed-menu').addEventListener('click', closeSeedMenu);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSeedMenu(); });

  // Keyboard: Escape to close
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSeedMenu();
  });
  document.getElementById('btn-close-seed-menu').focus();
}

function renderSeedMenuList() {
  const list = document.getElementById('seed-menu-list');
  if (!list) return;
  list.innerHTML = '';

  SEEDS.forEach(seed => {
    const owned = state.ownedSeeds.includes(seed.id);
    const locked = seed.streakRequired && state.streak < seed.streakRequired;
    const canAfford = state.coins >= seed.cost;
    const gardenFull = state.plants.length >= gardenCapacity();

    const item = document.createElement('div');
    item.className = `shop-item${seed.rare ? ' rare' : ''}`;

    const lockNote = locked ? `<div class="shop-lock-note">Unlocks at ${seed.streakRequired}-day streak</div>` : '';
    const priceHTML = seed.cost === 0
      ? `<span class="shop-free-label">Free</span>`
      : `<span class="shop-item-price"><svg class="icon icon-sm" aria-hidden="true"><use href="#icon-coin"/></svg>${seed.cost}</span>`;

    let btnHTML;
    if (owned && !seed.rare) {
      btnHTML = `<button class="shop-buy-btn owned" disabled>Owned</button>`;
    } else if (locked) {
      btnHTML = `<button class="shop-buy-btn locked" disabled>Locked</button>`;
    } else if (gardenFull) {
      btnHTML = `<button class="shop-buy-btn" disabled>Shelves full</button>`;
    } else if (!canAfford) {
      btnHTML = `<button class="shop-buy-btn" disabled>Not enough</button>`;
    } else {
      btnHTML = `<button class="shop-buy-btn" data-seed="${seed.id}">${seed.cost === 0 ? 'Plant' : 'Buy'}</button>`;
    }

    item.innerHTML = `
      <div class="shop-item-icon">${plantSVG({ seedId: seed.id, state: 'bloom', plantedAt: todayStr(), wateredAt: todayStr() })}</div>
      <div class="shop-item-name">${seed.name}${seed.rare ? ' <span class="rare-tag">RARE</span>' : ''}</div>
      <div class="shop-item-price-slot">${priceHTML}</div>
      <div class="shop-item-desc">${seed.desc}</div>
      ${lockNote}
      <div class="shop-item-action">${btnHTML}</div>
    `;

    const buyBtn = item.querySelector('[data-seed]');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => {
        buySeed(seed);
        closeSeedMenu();
        renderGarden2();
      });
    }
    list.appendChild(item);
  });
}

function closeSeedMenu() {
  const overlay = document.getElementById('seed-menu-modal');
  overlay.classList.remove('open');
  setTimeout(() => { overlay.hidden = true; overlay.innerHTML = ''; }, 250);
}

/* ── HARVEST ────────────────────────────────────────────────── */

/* Without this the garden is a one-way ratchet: plots fill, coins lose all
   purpose, and the loop dead-ends. Harvesting a bloomed plant returns coins
   and frees its plot, turning the shelf capacity into a rotation. */

function harvestValue(seed) {
  return Math.max(6, Math.round((seed.cost || 0) * 0.6) + (seed.rare ? 8 : 0));
}

function harvestPlant(index) {
  const plant = state.plants[index];
  if (!plant || plant.state !== 'bloom') return;
  const seed = SEEDS.find(s => s.id === plant.seedId) || SEEDS[0];
  const value = harvestValue(seed);

  state.plants.splice(index, 1);
  state.coins += value;
  saveState();

  bumpStat('plantsHarvested');
  evaluateRecompute();
  updateCoinDisplay();
  playCoin();
  showNotif('success', `harvest-${Date.now()}`, `${seed.name} harvested`,
    `+${value} coins, and a patch is free again. Its meal card stays in your collection.`, 'icon-meal');
  renderGarden2();
}

function waterPlant(index, plotEl) {
  const plant = state.plants[index];
  if (!plant) return;
  const wasWilt = plant.state === 'wilt';
  plant.wateredAt = todayStr();
  plant.state = 'grown';
  bumpStat('plantsWatered');
  if (wasWilt) bumpStat('plantsRevived');
  progressTask('g_water1', 'c_waterall');
  if (wasWilt) progressTask('c_revive');
  if (wasWilt) {
    showNotif('success', `water-${index}`, 'Plant recovered!', 'It looks so happy to see you again.', 'icon-bloom');
  } else {
    showNotif('success', `water-${index}`, 'Plant watered', 'It is looking very healthy today.', 'icon-water');
  }
  playWater();
  triggerWaterAnimation(plotEl || null);
  evaluateRecompute();
  saveState();
  renderGarden2();
}

document.getElementById('btn-water-all').addEventListener('click', () => {
  const today = todayStr();
  let watered = 0, revived = 0;
  state.plants.forEach(p => {
    if (p.state === 'wilt') { p.state = 'grown'; revived++; }
    if (p.wateredAt !== today) watered++;
    p.wateredAt = today;
  });
  if (watered) bumpStat('plantsWatered', watered);
  if (revived) bumpStat('plantsRevived', revived);
  progressTask('g_water1', 'c_waterall');
  if (revived) progressTask('c_revive');
  showNotif(
    revived > 0 ? 'success' : 'info',
    'water-all',
    revived > 0 ? `${revived} plant${revived > 1 ? 's' : ''} recovered!` : 'All plants watered',
    revived > 0 ? 'They are all looking healthy again.' : 'Your garden looks wonderful.',
    'icon-water'
  );
  playWater();
  triggerWaterAnimation(null);
  evaluateRecompute();
  saveState();
  renderGarden2();
});

/* ── COIN DISPLAY ───────────────────────────────────────────── */

function updateCoinDisplay() {
  document.getElementById('coin-count').textContent = state.coins;
  document.getElementById('shop-coin-count').textContent = state.coins;
  document.getElementById('streak-count').textContent = state.streak;
}

/* ── LEVEL PATH SYSTEM ──────────────────────────────────────── */

const ISLANDS = [
  {
    id: 'memory-meadow',
    name: 'Memory Meadow',
    desc: 'Train your recall and attention through gentle matching and observation games.',
    icon: 'icon-tiles',
    colorClass: 'memory-meadow',
    color: '#73875D',
    levels: [
      { id: 1,  type: 'tiles',   pairs: 4,  coins: 4,  label: 'First steps' },
      { id: 2,  type: 'words',   sets: 2,   coins: 4,  label: 'Word warmup' },
      { id: 3,  type: 'tiles',   pairs: 5,  coins: 5,  label: 'Growing focus' },
      { id: 4,  type: 'oddone',  rounds: 3, coins: 5,  label: 'Spot the odd' },
      { id: 5,  type: 'pattern', rounds: 2, coins: 6,  label: 'Pattern start' },
      { id: 6,  type: 'tiles',   pairs: 6,  coins: 6,  label: 'Memory bloom' },
      { id: 7,  type: 'words',   sets: 3,   coins: 6,  label: 'Word garden' },
      { id: 8,  type: 'tiles',   pairs: 7,  coins: 8,  label: 'Full bloom' },
    ],
  },
  {
    id: 'pattern-peaks',
    name: 'Pattern Peaks',
    desc: 'Stretch your attention and sequencing skills with repeating patterns and rhythms.',
    icon: 'icon-clock',
    colorClass: 'pattern-peaks',
    color: '#E78F37',
    levels: [
      { id: 1,  type: 'pattern', rounds: 2, coins: 4,  label: 'Easy climb' },
      { id: 2,  type: 'tiles',   pairs: 4,  coins: 4,  label: 'Tile rest' },
      { id: 3,  type: 'pattern', rounds: 3, coins: 5,  label: 'Steady pace' },
      { id: 4,  type: 'words',   sets: 2,   coins: 5,  label: 'Word bridge' },
      { id: 5,  type: 'pattern', rounds: 4, coins: 6,  label: 'High ridge' },
      { id: 6,  type: 'oddone',  rounds: 4, coins: 6,  label: 'Sharp eye' },
      { id: 7,  type: 'pattern', rounds: 5, coins: 8,  label: 'Peak view' },
      { id: 8,  type: 'pattern', rounds: 6, coins: 10, label: 'Summit' },
    ],
  },
  {
    id: 'logic-lake',
    name: 'Logic Lake',
    desc: 'Sharpen your reasoning and category thinking with careful observation.',
    icon: 'icon-brain',
    colorClass: 'logic-lake',
    color: '#7B5371',
    levels: [
      { id: 1,  type: 'oddone',  rounds: 2, coins: 4,  label: 'Calm waters' },
      { id: 2,  type: 'words',   sets: 2,   coins: 4,  label: 'Word ripples' },
      { id: 3,  type: 'oddone',  rounds: 3, coins: 5,  label: 'Deep think' },
      { id: 4,  type: 'tiles',   pairs: 5,  coins: 5,  label: 'Reflection' },
      { id: 5,  type: 'oddone',  rounds: 4, coins: 6,  label: 'Clear mind' },
      { id: 6,  type: 'pattern', rounds: 3, coins: 6,  label: 'Flow state' },
      { id: 7,  type: 'oddone',  rounds: 5, coins: 8,  label: 'Still water' },
      { id: 8,  type: 'oddone',  rounds: 6, coins: 10, label: 'Deep lake' },
    ],
  },
  {
    id: 'word-woods',
    name: 'Word Woods',
    desc: 'Keep your language sharp and your associations strong through word play.',
    icon: 'icon-book',
    colorClass: 'word-woods',
    color: '#AE382B',
    levels: [
      { id: 1,  type: 'words',   sets: 2,   coins: 4,  label: 'First words' },
      { id: 2,  type: 'tiles',   pairs: 4,  coins: 4,  label: 'Leaf through' },
      { id: 3,  type: 'words',   sets: 3,   coins: 5,  label: 'Branching out' },
      { id: 4,  type: 'pattern', rounds: 2, coins: 5,  label: 'Word rhythm' },
      { id: 5,  type: 'words',   sets: 4,   coins: 6,  label: 'Tall tales' },
      { id: 6,  type: 'oddone',  rounds: 3, coins: 6,  label: 'Forest eye' },
      { id: 7,  type: 'words',   sets: 5,   coins: 8,  label: 'Word master' },
      { id: 8,  type: 'words',   sets: 6,   coins: 10, label: 'Ancient oak' },
    ],
  },
  /* Kopitiam Corner sits last on purpose. The four islands above form a chain:
     each unlocks on five levels of the one before it, and inserting anything
     into the middle would rewire that chain. Appending instead leaves it exactly
     as it was, and `alwaysOpen` means this island is never gated behind it: the
     kakis' table is somewhere you sit down, not a course you ladder into.

     `pairs` here is only a base. nextKakiDial() moves the real wall one pair
     either side of it from recent form, so the ladder still reads as a ladder
     while the table quietly finds the player's pace. */
  {
    id: 'kopitiam-corner',
    name: 'Kopitiam Corner',
    desc: 'Sit at the mahjong table with Auntie Lily, Uncle Beng and Auntie Rose. They talk, they remember you, and nobody is counting.',
    icon: 'icon-kopi',
    colorClass: 'kopitiam-corner',
    color: '#E07A5F',
    alwaysOpen: true,
    levels: [
      { id: 1,  type: 'kakis',   pairs: 4,  coins: 4,  label: 'First kopi' },
      { id: 2,  type: 'kakis',   pairs: 4,  coins: 4,  label: 'Warm table' },
      { id: 3,  type: 'kakis',   pairs: 5,  coins: 5,  label: 'Second round' },
      { id: 4,  type: 'kakis',   pairs: 5,  coins: 5,  label: 'Kaya toast' },
      { id: 5,  type: 'kakis',   pairs: 6,  coins: 6,  label: 'Regulars' },
      { id: 6,  type: 'kakis',   pairs: 6,  coins: 6,  label: 'Afternoon lull' },
      { id: 7,  type: 'kakis',   pairs: 7,  coins: 8,  label: 'Full table' },
      { id: 8,  type: 'kakis',   pairs: 8,  coins: 10, label: 'Closing time' },
    ],
  },
];

const EXERCISE_META = {
  tiles:   { name: 'Tile Match',  icon: 'icon-tiles',  tagClass: 'tiles'   },
  pattern: { name: 'Pattern',     icon: 'icon-clock',  tagClass: 'pattern' },
  oddone:  { name: 'Odd One Out', icon: 'icon-brain',  tagClass: 'oddone'  },
  words:   { name: 'Word Pairs',  icon: 'icon-book',   tagClass: 'words'   },
  kakis:   { name: 'Mahjong Kakis', icon: 'icon-kopi', tagClass: 'kakis'   },
};

function isLevelComplete(islandId, levelIdx) {
  if (!state.levelProgress) return false;
  return (state.levelProgress[islandId] || []).includes(levelIdx);
}

function markLevelComplete(islandId, levelIdx) {
  if (!state.levelProgress) state.levelProgress = {};
  if (!state.levelProgress[islandId]) state.levelProgress[islandId] = [];
  if (!state.levelProgress[islandId].includes(levelIdx)) {
    state.levelProgress[islandId].push(levelIdx);
    progressTask('c_level');
    evaluateRecompute(); // mind_island
  }
  saveState();
}

function getIslandUnlockState(islandIdx) {
  if (islandIdx === 0) return true;
  // An always-open island is reachable from a standing start and takes part in
  // no chain, so it neither needs a predecessor nor becomes one.
  if ((ISLANDS[islandIdx] || {}).alwaysOpen) return true;
  const prevIsland = ISLANDS[islandIdx - 1];
  const prevDone = (state.levelProgress[prevIsland.id] || []).length;
  return prevDone >= 5;
}

function getNodeOffset(index) {
  const positions = [0, -1, -1, 0, 1, 1, 0, -1, -1, 0];
  return positions[index % positions.length];
}

/* ── COURSE SELECT SCREEN ───────────────────────────────────── */

function renderExercises() {
  updateCoinDisplay();
  const container = document.getElementById('level-path-container');
  container.innerHTML = '';

  // If an island is active, show path for that island
  if (state.activeIsland) {
    renderIslandPath(state.activeIsland, container);
    return;
  }

  /* No second header here. The screen's own "Brain Exercises" heading sits
     directly above, and running both cost about 500px of an 844px screen
     before the first card. */

  const list = document.createElement('div');
  list.className = 'course-list';

  ISLANDS.forEach((island, idx) => {
    const unlocked = getIslandUnlockState(idx);
    const doneCount = (state.levelProgress[island.id] || []).length;
    const total = island.levels.length;
    const isComplete = doneCount === total;

    const card = document.createElement('button');
    card.className = `course-card ${island.colorClass}${unlocked ? '' : ' course-locked'}${isComplete ? ' course-complete' : ''}`;
    card.setAttribute('aria-label', unlocked ? `${island.name} — ${doneCount} of ${total} levels done` : `${island.name} — locked`);
    card.setAttribute('tabindex', unlocked ? '0' : '-1');

    /* Same flat-grid reason as the shop card: icon, name and the arrow share
       the top row, and the description and progress badge span the card. The
       nested info column used to leave the name too narrow to hold a
       two-word course title on one line. */
    card.innerHTML = `
      <div class="course-card-icon">
        <svg><use href="#${island.icon}"/></svg>
      </div>
      <div class="course-card-name">${island.name}</div>
      ${unlocked ? `<svg class="icon course-arrow"><use href="#icon-arrow-right"/></svg>` : `<svg class="icon course-lock"><use href="#icon-close"/></svg>`}
      <div class="course-card-desc">${island.desc}</div>
      <div class="course-card-progress">
        ${isComplete
          ? `<span class="course-badge done"><svg class="icon icon-sm"><use href="#icon-check"/></svg> Complete</span>`
          : unlocked
            ? `<span class="course-badge progress">${doneCount} / ${total} levels</span>`
            : `<span class="course-badge locked"><svg class="icon icon-sm"><use href="#icon-close"/></svg> Complete 5 levels in ${ISLANDS[idx-1].name} to unlock</span>`
        }
      </div>
    `;

    if (unlocked) {
      card.addEventListener('click', () => {
        playSelect();
        state.activeIsland = island.id;
        saveState();
        renderExercises();
        // Scroll to top of path
        document.getElementById('screen-exercises').scrollTop = 0;
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          state.activeIsland = island.id;
          saveState();
          renderExercises();
        }
      });
    }

    list.appendChild(card);
  });

  container.appendChild(list);
}

/* ── ISLAND PATH VIEW ───────────────────────────────────────── */

function renderIslandPath(islandId, container) {
  const island = ISLANDS.find(i => i.id === islandId);
  if (!island) { state.activeIsland = null; renderExercises(); return; }

  const islandIdx = ISLANDS.indexOf(island);
  const firstIncomplete = island.levels.findIndex((_, i) => !isLevelComplete(islandId, i));
  const doneCount = (state.levelProgress[islandId] || []).length;

  // Back button
  const backBar = document.createElement('div');
  backBar.className = 'path-back-bar';
  backBar.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="btn-back-to-courses">
      <svg class="icon icon-sm"><use href="#icon-arrow-left"/></svg>
      All courses
    </button>
  `;
  container.appendChild(backBar);
  document.getElementById('btn-back-to-courses').addEventListener('click', () => {
    state.activeIsland = null;
    saveState();
    renderExercises();
  });

  // Island header
  const header = document.createElement('div');
  header.className = `island-header ${island.colorClass}`;
  header.innerHTML = `
    <div class="island-icon">
      <svg><use href="#${island.icon}"/></svg>
    </div>
    <div>
      <div class="island-title">${island.name}</div>
      <div class="island-desc">${island.desc}</div>
      <div class="island-progress">${doneCount} of ${island.levels.length} levels done</div>
    </div>
  `;
  container.appendChild(header);

  // Path with SVG connectors
  const pathWrap = document.createElement('div');
  pathWrap.className = 'path-wrap';

  const track = document.createElement('div');
  track.className = 'path-track';

  const NODE_H = 140; // approximate height per node + margin
  const pathSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  pathSvg.setAttribute('class', 'path-svg');
  pathSvg.setAttribute('aria-hidden', 'true');

  const nodes = [];

  island.levels.forEach((level, levelIdx) => {
    const completed = isLevelComplete(islandId, levelIdx);
    const isCurrent = levelIdx === firstIncomplete;
    const locked = !completed && levelIdx > firstIncomplete;

    const node = document.createElement('div');
    node.className = `level-node${completed ? ' completed' : isCurrent ? ' current' : ' locked'}`;
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', locked ? '-1' : '0');
    node.setAttribute('aria-label', `${level.label} — ${completed ? 'completed' : isCurrent ? 'current level' : 'locked'}`);

    const offset = getNodeOffset(levelIdx);
    node.style.marginLeft = `${offset * 80}px`;

    const meta = EXERCISE_META[level.type];
    const firstClear = !completed;

    node.innerHTML = `
      <div class="node-pill">
        <svg aria-hidden="true"><use href="#${meta.icon}"/></svg>
        <div class="node-badge">${completed
          ? `<svg class="icon" style="width:14px;height:14px;color:#F5EFEB" aria-hidden="true"><use href="#icon-check"/></svg>`
          : level.id}
        </div>
      </div>
      <div class="node-body">
        <div class="node-type-tag ${meta.tagClass}">${meta.name}</div>
        <div class="node-label">${level.label}</div>
        ${!locked ? `<div class="node-reward">
          <svg class="icon" aria-hidden="true"><use href="#icon-coin"/></svg>
          ${firstClear ? level.coins : Math.max(1, Math.floor(level.coins * 0.25))} coins
        </div>` : ''}
      </div>
    `;

    if (!locked) {
      node.addEventListener('click', () => {
        playSelect();
        launchLevel(islandId, levelIdx);
      });
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launchLevel(islandId, levelIdx); }
      });
    }

    track.appendChild(node);
    nodes.push({ el: node, offset, levelIdx });
  });

  pathWrap.appendChild(pathSvg);
  pathWrap.appendChild(track);
  container.appendChild(pathWrap);

  // Draw connectors after layout
  requestAnimationFrame(() => drawPathConnectors(pathSvg, nodes, island.color));
}

function drawPathConnectors(svg, nodes, color) {
  if (!svg || nodes.length < 2) return;
  const wrap = svg.parentElement;
  const wrapRect = wrap.getBoundingClientRect();
  svg.setAttribute('width', wrapRect.width);
  svg.setAttribute('height', wrapRect.height);
  svg.innerHTML = '';

  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i].el.getBoundingClientRect();
    const b = nodes[i + 1].el.getBoundingClientRect();

    const ax = a.left + a.width / 2 - wrapRect.left;
    const ay = a.top + a.height * 0.45 - wrapRect.top;
    const bx = b.left + b.width / 2 - wrapRect.left;
    const by = b.top + b.height * 0.45 - wrapRect.top;

    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${ax} ${ay} Q ${mx} ${my - 20} ${bx} ${by}`);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-dasharray', '5 5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('opacity', '0.5');
    svg.appendChild(path);
  }
}

function launchLevel(islandId, levelIdx) {
  const island = ISLANDS.find(i => i.id === islandId);
  if (!island) return;
  const level = island.levels[levelIdx];
  if (!level) return;

  currentLevelRef = { islandId, levelIdx, level };
  showScreen('play', 'forward');
  startExercise(level.type);
}

let currentLevelRef = null;

/* ── SHOP RENDERER ──────────────────────────────────────────── */

function renderShop() {
  const grid = document.getElementById('shop-grid');
  grid.innerHTML = '';
  updateCoinDisplay();

  const freeBtn = document.getElementById('btn-free-seed');
  const canClaim = isNewDay(state.freeSeedDate);
  freeBtn.disabled = !canClaim;
  freeBtn.innerHTML = canClaim
    ? `<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-gift"/></svg> Free daily seed`
    : `<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-gift"/></svg> Claimed today`;

  SEEDS.forEach((seed, i) => {
    const owned = state.ownedSeeds.includes(seed.id);
    const locked = seed.streakRequired && state.streak < seed.streakRequired;
    const canAfford = state.coins >= seed.cost;
    const gardenFull = state.plants.length >= gardenCapacity();

    const item = document.createElement('div');
    item.className = `shop-item${seed.rare ? ' rare' : ''}`;
    item.style.animationDelay = `${i * 40}ms`;
    item.classList.add('stagger-item');

    const lockNote = locked ? `<div class="shop-lock-note">Unlocks at ${seed.streakRequired}-day streak</div>` : '';
    const priceHTML = seed.cost === 0
      ? `<span class="shop-free-label">Free</span>`
      : `<span class="shop-item-price"><svg class="icon icon-sm" aria-hidden="true"><use href="#icon-coin"/></svg>${seed.cost}</span>`;

    let btnHTML;
    if (owned && !seed.rare) {
      btnHTML = `<button class="shop-buy-btn owned" disabled>Owned</button>`;
    } else if (locked) {
      btnHTML = `<button class="shop-buy-btn locked" disabled>Locked</button>`;
    } else if (gardenFull) {
      btnHTML = `<button class="shop-buy-btn" disabled>Shelves full</button>`;
    } else if (!canAfford) {
      btnHTML = `<button class="shop-buy-btn" disabled>Not enough</button>`;
    } else {
      btnHTML = `<button class="shop-buy-btn" data-seed="${seed.id}">${seed.cost === 0 ? 'Plant' : 'Buy'}</button>`;
    }

    item.innerHTML = `
      <div class="shop-item-icon">${plantSVG({ seedId: seed.id, state: 'bloom', plantedAt: todayStr(), wateredAt: todayStr() })}</div>
      <div class="shop-item-name">${seed.name}${seed.rare ? ' <span class="rare-tag">RARE</span>' : ''}</div>
      <div class="shop-item-price-slot">${priceHTML}</div>
      <div class="shop-item-desc">${seed.desc}</div>
      ${lockNote}
      <div class="shop-item-action">${btnHTML}</div>
    `;

    const buyBtn = item.querySelector('[data-seed]');
    if (buyBtn) buyBtn.addEventListener('click', () => buySeed(seed));
    grid.appendChild(item);
  });
}

function buySeed(seed) {
  if (state.coins < seed.cost) return;
  if (state.plants.length >= gardenCapacity()) {
    showNotif('warn', 'garden-full', 'Your garden is full', 'Clear a new row of land to make room for more plants.', 'icon-garden');
    return;
  }
  state.coins -= seed.cost;
  if (!state.ownedSeeds.includes(seed.id)) state.ownedSeeds.push(seed.id);
  plantSeed(seed.id);
  playCoin();
  showNotif('success', 'buy-seed', `${seed.name} planted!`, 'It has been added to your garden.', 'icon-seed');
  renderShop();
  saveState();
}

function plantSeed(seedId) {
  if (state.plants.length >= gardenCapacity()) return false;
  const seed = SEEDS.find(s => s.id === seedId);
  state.plants.push({
    id: Date.now(),
    seedId,
    plantedAt: todayStr(),
    wateredAt: null,
    state: 'seed',
    exerciseType: seed ? seed.exerciseType : 'any',
  });
  if (!state.stats.speciesEverGrown.includes(seedId)) {
    state.stats.speciesEverGrown.push(seedId);
    ACHIEVEMENTS.filter(a => a.metric === 'speciesEverGrown').forEach(evaluateAchievement);
  }
  progressTask('s_plant');
  evaluateRecompute();
  saveState();
  return true;
}

document.getElementById('btn-free-seed').addEventListener('click', () => {
  if (!isNewDay(state.freeSeedDate)) return;
  if (state.plants.length >= gardenCapacity()) {
    showNotif('warn', 'garden-full', 'Your garden is full', 'Clear a new row of land to make room for more plants.', 'icon-garden');
    return;
  }
  state.freeSeedDate = todayStr();
  const commonSeeds = SEEDS.filter(s => !s.rare && !state.ownedSeeds.includes(s.id));
  const freeSeed = commonSeeds.length > 0
    ? commonSeeds[Math.floor(Math.random() * commonSeeds.length)]
    : SEEDS.find(s => s.id === 'pandan');
  if (!state.ownedSeeds.includes(freeSeed.id)) state.ownedSeeds.push(freeSeed.id);
  plantSeed(freeSeed.id);
  playCoin();
  showNotif('success', 'free-seed', 'Free seed claimed!', `A ${freeSeed.name} has been planted in your garden.`, 'icon-gift');
  saveState();
  renderShop();
});

/* ── PROFILE RENDERER ───────────────────────────────────────── */

/* ── THE GARDEN ALMANAC — view ──────────────────────────────── */

const ALMANAC_CATS = [
  { id: 'cultivation', name: 'Cultivation',  icon: 'icon-sprout' },
  { id: 'mind',        name: 'Mind',         icon: 'icon-brain'  },
  { id: 'devotion',    name: 'Devotion',     icon: 'icon-sun'    },
  { id: 'collection',  name: 'Collection',   icon: 'icon-book'   },
  { id: 'quiet',       name: 'Quiet Discoveries', icon: 'icon-flower' },
];

function renderAlmanac() {
  const host = document.getElementById('almanac-body');
  if (!host) return;
  host.innerHTML = '';

  const earnedCount = ACHIEVEMENTS.reduce((n, a) => n + (state.achievements[a.id] ? state.achievements[a.id].tier + 1 : 0), 0);
  const totalTiers = ACHIEVEMENTS.reduce((n, a) => n + a.tiers.length, 0);

  const summary = document.createElement('div');
  summary.className = 'almanac-summary';
  summary.innerHTML = `
    <svg class="icon icon-lg" aria-hidden="true"><use href="#icon-book"/></svg>
    <div>
      <div class="almanac-summary-num">${earnedCount} <span>of ${totalTiers} plates</span></div>
      <div class="almanac-summary-sub">Your field journal of a life in the garden</div>
    </div>
  `;
  host.appendChild(summary);

  ALMANAC_CATS.forEach(cat => {
    const items = ACHIEVEMENTS.filter(a => a.cat === cat.id);
    if (!items.length) return;

    const section = document.createElement('div');
    section.className = 'almanac-section';
    section.innerHTML = `
      <div class="almanac-cat-head">
        <svg class="icon" aria-hidden="true"><use href="#${cat.icon}"/></svg>
        ${cat.name}
      </div>
      <div class="almanac-grid"></div>
    `;
    const grid = section.querySelector('.almanac-grid');

    items.forEach(a => {
      const earned = state.achievements[a.id];
      const value = statValue(a, state);
      const nextTier = earned ? a.tiers[earned.tier + 1] : a.tiers[0];
      const isHidden = a.hidden && !earned;

      const plate = document.createElement('div');
      plate.className = `almanac-plate${earned ? ' earned' : ''}${isHidden ? ' mystery' : ''}`;

      if (isHidden) {
        plate.innerHTML = `
          <div class="plate-figure mystery-mark">?</div>
          <div class="plate-name">A quiet discovery</div>
          <div class="plate-desc">Keep tending your garden to find out.</div>
        `;
      } else {
        const tierLabel = earned ? TIER_LABELS[earned.tier] : null;
        const progress = nextTier ? `${Math.min(value, nextTier.at)} / ${nextTier.at}` : 'Complete';
        plate.innerHTML = `
          <div class="plate-figure">
            <svg class="icon icon-xl" aria-hidden="true"><use href="#${cat.icon}"/></svg>
          </div>
          <div class="plate-name">${a.name}</div>
          <div class="plate-desc">${a.desc}</div>
          <div class="plate-foot">
            ${earned ? `<span class="plate-tier">${tierLabel}${earned.tier === a.tiers.length - 1 && !nextTier ? '' : ''}</span>` : ''}
            <span class="plate-progress">${progress}</span>
          </div>
          ${earned ? `<div class="plate-stamp" aria-hidden="true">
            <svg class="icon" aria-hidden="true"><use href="#icon-check"/></svg>
          </div>` : ''}
        `;
      }
      grid.appendChild(plate);
    });

    host.appendChild(section);
  });
}

function renderProfile() {
  const cards = document.getElementById('profile-cards');
  const mealGrid = document.getElementById('meal-grid');
  cards.innerHTML = '';
  mealGrid.innerHTML = '';

  // Almanac entry card
  const earnedCount = ACHIEVEMENTS.reduce((n, a) => n + (state.achievements[a.id] ? state.achievements[a.id].tier + 1 : 0), 0);
  const totalTiers = ACHIEVEMENTS.reduce((n, a) => n + a.tiers.length, 0);
  const almanacCard = document.createElement('button');
  almanacCard.className = 'profile-card almanac-entry stagger-item';
  almanacCard.setAttribute('aria-label', `Open the Garden Almanac — ${earnedCount} of ${totalTiers} plates earned`);
  almanacCard.innerHTML = `
    <div class="profile-card-icon"><svg class="icon icon-lg" aria-hidden="true"><use href="#icon-book"/></svg></div>
    <div style="flex:1">
      <div class="profile-card-title">The Garden Almanac</div>
      <div class="profile-card-value" style="font-size:1.4rem">${earnedCount} <span style="font-size:1rem;color:var(--text-muted)">of ${totalTiers} plates</span></div>
      <div class="profile-card-sub">Your field journal of achievements</div>
    </div>
    <svg class="icon" style="color:var(--foliage-mid)" aria-hidden="true"><use href="#icon-arrow-right"/></svg>
  `;
  almanacCard.addEventListener('click', () => showScreen('almanac', 'forward'));
  cards.appendChild(almanacCard);

  const healthyCount = state.plants.filter(p => p.state === 'grown' || p.state === 'bloom').length;
  const nextMilestone = state.streak < 3 ? 3 : state.streak < 7 ? 7 : state.streak < 14 ? 14 : state.streak < 30 ? 30 : null;
  const streakPct = nextMilestone ? Math.min(100, Math.round((state.streak / nextMilestone) * 100)) : 100;

  cards.insertAdjacentHTML('beforeend', `
    <div class="profile-card stagger-item">
      <div class="profile-card-icon"><svg class="icon icon-lg" aria-hidden="true"><use href="#icon-brain"/></svg></div>
      <div>
        <div class="profile-card-title">Exercises completed</div>
        <div class="profile-card-value">${state.totalExercises}</div>
        <div class="profile-card-sub">Great work keeping your mind active</div>
      </div>
    </div>
    <div class="profile-card stagger-item" style="animation-delay:40ms">
      <div class="profile-card-icon"><svg class="icon icon-lg" aria-hidden="true"><use href="#icon-bloom"/></svg></div>
      <div>
        <div class="profile-card-title">Plants thriving</div>
        <div class="profile-card-value">${healthyCount} / ${state.plants.length}</div>
        <div class="profile-card-sub">${state.plants.length === 0 ? 'Plant your first seed today' : healthyCount === state.plants.length ? 'Your garden is in perfect health' : 'Some plants need water'}</div>
      </div>
    </div>
    <div class="profile-card stagger-item" style="animation-delay:80ms">
      <div class="profile-card-icon"><svg class="icon icon-lg" aria-hidden="true"><use href="#icon-streak"/></svg></div>
      <div style="flex:1">
        <div class="profile-card-title">Daily streak</div>
        <div class="profile-card-value">${state.streak} day${state.streak !== 1 ? 's' : ''}</div>
        ${nextMilestone ? `<div class="streak-track"><div class="streak-fill" style="width:${streakPct}%"></div></div>
        <div class="profile-card-sub">Next reward at ${nextMilestone} days</div>` : `<div class="profile-card-sub">Amazing — you are at the top!</div>`}
        ${state.streakFreezes > 0 ? `<div class="profile-card-sub" style="margin-top:0.25rem;color:var(--accent-plum)">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-gift"/></svg>
          ${state.streakFreezes} streak freeze${state.streakFreezes > 1 ? 's' : ''} available
        </div>` : ''}
      </div>
    </div>
    <div class="profile-card stagger-item" style="animation-delay:120ms">
      <div class="profile-card-icon"><svg class="icon icon-lg" aria-hidden="true"><use href="#icon-coin"/></svg></div>
      <div>
        <div class="profile-card-title">Total coins</div>
        <div class="profile-card-value">${state.coins}</div>
        <div class="profile-card-sub">Spend them in the seed shop</div>
      </div>
    </div>
  `);

  MEALS.forEach((meal, i) => {
    const unlocked = state.unlockedMeals.includes(meal.id);
    const card = document.createElement('div');
    card.className = `meal-card${unlocked ? '' : ' locked'} stagger-item`;
    card.style.animationDelay = `${i * 40}ms`;
    card.innerHTML = `
      <div class="meal-card-thumb">
        <svg aria-hidden="true"><use href="#${meal.icon}"/></svg>
      </div>
      <div class="meal-card-body">
        <div class="meal-card-name">${meal.name}</div>
        <div class="meal-card-ingredients">${meal.ingredients.map(ing => {
          const s = SEEDS.find(sd => sd.id === ing);
          return s ? s.name : ing;
        }).join(' + ')}</div>
        <div class="meal-card-badge ${unlocked ? 'unlocked' : 'locked'}">
          ${unlocked
            ? `<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-check"/></svg> Unlocked`
            : `<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-close"/></svg> Locked`}
        </div>
      </div>
    `;
    mealGrid.appendChild(card);
  });
}

/* ── SHARE MODAL ────────────────────────────────────────────── */

document.getElementById('share-btn').addEventListener('click', () => {
  closeMenu();
  const modal = document.getElementById('share-modal');
  const preview = document.getElementById('share-preview');
  const stats = document.getElementById('share-stats');
  preview.innerHTML = '';

  state.plants.slice(0, 5).forEach(p => {
    const div = document.createElement('div');
    div.className = 'share-preview-plant';
    div.innerHTML = plantSVG(p);
    preview.appendChild(div);
  });

  const bloomCount = state.plants.filter(p => p.state === 'bloom').length;
  stats.innerHTML = `<strong>${state.plants.length}</strong> plants · <strong>${bloomCount}</strong> blooming · <strong>${state.streak}</strong> day streak · <strong>${state.totalExercises}</strong> exercises done`;

  modal.hidden = false;
});

document.getElementById('btn-close-share').addEventListener('click', () => {
  document.getElementById('share-modal').hidden = true;
});

document.getElementById('share-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});

document.getElementById('btn-share-native').addEventListener('click', async () => {
  const text = `My Garden of Life: ${state.plants.length} plants, ${state.streak}-day streak, ${state.totalExercises} brain exercises done. Growing every day!`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Garden of Life', text }); bumpStat('photosShared'); } catch (e) {}
  } else {
    copyShareText(text);
    bumpStat('photosShared');
  }
});

document.getElementById('btn-copy-share').addEventListener('click', () => {
  copyShareText(`My Garden of Life: ${state.plants.length} plants, ${state.streak}-day streak, ${state.totalExercises} brain exercises done. Growing every day!`);
});

function copyShareText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showNotif('success', 'share-copy', 'Copied!', 'Share text copied to clipboard.', 'icon-share');
    });
  }
}

/* ── MUTE TOGGLE ────────────────────────────────────────────── */

document.getElementById('mute-btn').addEventListener('click', () => {
  state.sound = !state.sound;
  syncSoundControl();
  saveState();
});

/* ── NAV ITEMS ──────────────────────────────────────────────── */

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.setAttribute('aria-label', btn.querySelector('span')?.textContent || btn.dataset.screen);
  btn.addEventListener('click', () => {
    if (btn.dataset.screen === 'exercises') {
      state.activeIsland = null;
      saveState();
    }
    showScreen(btn.dataset.screen, 'forward');
    playSelect();
  });
});

/* ════════════════════════════════════════════════════════════
   COGNITIVE EXERCISES
   ════════════════════════════════════════════════════════════ */

let currentExercise = null;
let playState = {};

document.getElementById('btn-back-from-almanac').addEventListener('click', () => {
  showScreen('profile', 'back');
});

document.getElementById('btn-back-from-play').addEventListener('click', () => {
  showScreen('exercises', 'back');
});

function startExercise(type) {
  currentExercise = type;
  playState = {};
  document.getElementById('play-area').innerHTML = '';
  document.getElementById('play-footer').innerHTML = '';

  const titles = {
    tiles:   'Tile Matching',
    pattern: 'Pattern Sequence',
    oddone:  'Odd One Out',
    words:   'Word Pairs',
    kakis:   'Kopitiam Corner',
  };
  document.getElementById('play-title').textContent = titles[type] || 'Exercise';

  const level = currentLevelRef ? currentLevelRef.level : null;

  switch (type) {
    case 'tiles':   initTileMatch(level);   break;
    case 'pattern': initPatternSeq(level);  break;
    case 'oddone':  initOddOneOut(level);   break;
    case 'words':   initWordPairs(level);   break;
    case 'kakis':   initKakis(level);       break;
  }
}

function completeExercise(coins, exerciseType) {
  const firstClear = currentLevelRef
    ? !isLevelComplete(currentLevelRef.islandId, currentLevelRef.levelIdx)
    : true;
  const rewardCoins = currentLevelRef
    ? (firstClear ? currentLevelRef.level.coins : Math.max(1, Math.floor(currentLevelRef.level.coins * 0.25)))
    : coins;

  state.coins += rewardCoins;
  state.totalExercises++;
  state.exerciseHistory.push({ type: exerciseType, date: todayStr() });

  // Stats + tasks
  bumpStat('exercisesCompleted');
  if (!firstClear) bumpStat('levelsReplayed');
  const noMistakes = (playState.mistakes || 0) === 0;
  if (noMistakes) bumpStat('perfectExercises');
  progressTask('c_ex1', 's_ex3', 'c_level');
  if (noMistakes) progressTask('s_perfect');
  const typeTaskMap = { tiles: 'c_tiles', pattern: 'c_pattern', words: 'c_words', oddone: 'c_odd', kakis: 'c_kakis' };
  if (typeTaskMap[exerciseType]) progressTask(typeTaskMap[exerciseType]);

  // All-four-types-in-one-day tracking
  const tKey = 'typesToday';
  if (!state.stats[tKey] || state.stats[tKey].date !== todayStr()) {
    state.stats[tKey] = { date: todayStr(), types: [] };
  }
  if (!state.stats[tKey].types.includes(exerciseType)) {
    state.stats[tKey].types.push(exerciseType);
    if (state.stats[tKey].types.length >= 2) progressTask('s_twotypes');
    if (state.stats[tKey].types.length === 4) bumpStat('allFourInOneDay');
  }

  // Comeback: garden remembers you — restore pre-gap streak
  if (state.absence.restorePending) {
    state.absence.restorePending = false;
    state.streak = Math.max(state.streak, state.absence.lastStreakBeforeGap);
    showNotif('streak', 'streak-restored', 'Your garden remembered you', `Your ${state.streak}-day streak is right where you left it.`, 'icon-sun');
  }

  if (currentLevelRef) {
    markLevelComplete(currentLevelRef.islandId, currentLevelRef.levelIdx);
  }

  const matchingSeed = SEEDS.find(s => s.exerciseType === exerciseType && !s.rare)
    || SEEDS.find(s => s.exerciseType === 'any');
  let seedAwarded = null;
  if (firstClear && matchingSeed && !state.ownedSeeds.includes(matchingSeed.id)) {
    state.ownedSeeds.push(matchingSeed.id);
    if (state.plants.length < gardenCapacity()) {
      plantSeed(matchingSeed.id);
      seedAwarded = matchingSeed;
    }
  }

  saveState();
  updateCoinDisplay();
  playSuccess();
  triggerCelebration();
  checkMealUnlocks();
  drainAwards();

  const island = currentLevelRef ? ISLANDS.find(i => i.id === currentLevelRef.islandId) : null;
  const nextLevelIdx = currentLevelRef ? currentLevelRef.levelIdx + 1 : -1;
  const hasNext = island && nextLevelIdx < island.levels.length;
  const levelName = currentLevelRef ? currentLevelRef.level.label : null;

  const playArea = document.getElementById('play-area');
  const playFooter = document.getElementById('play-footer');
  playArea.innerHTML = '';
  playFooter.innerHTML = '';

  playArea.innerHTML = `
    <div class="completion-card">
      <div class="completion-icon">
        <svg class="icon icon-xl" aria-hidden="true"><use href="#icon-brain"/></svg>
      </div>
      <div>
        <div class="completion-title">${levelName ? `"${levelName}" complete!` : 'Well done!'}</div>
        <div class="completion-sub">
          ${island ? `${island.name} · Level ${currentLevelRef.levelIdx + 1} of ${island.levels.length}` : 'Exercise complete.'}
          ${!firstClear ? '<br>Practice run — reduced reward.' : ''}
        </div>
      </div>
      <div class="completion-rewards">
        <span class="reward-chip coins">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-coin"/></svg>
          +${rewardCoins} coins
        </span>
        ${seedAwarded ? `<span class="reward-chip seed">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-seed"/></svg>
          ${seedAwarded.name} seed
        </span>` : ''}
      </div>
    </div>
  `;

  const nextLevel = hasNext ? island.levels[nextLevelIdx] : null;
  playFooter.innerHTML = `
    ${hasNext ? `<button class="btn btn-primary btn-lg" id="btn-next-level">
      <svg class="icon" aria-hidden="true"><use href="#icon-arrow-right"/></svg>
      Next: ${nextLevel.label}
    </button>` : `<button class="btn btn-primary btn-lg" id="btn-goto-path">
      <svg class="icon" aria-hidden="true"><use href="#icon-brain"/></svg>
      Back to path
    </button>`}
    <button class="btn btn-secondary" id="btn-goto-garden">
      <svg class="icon" aria-hidden="true"><use href="#icon-garden"/></svg>
      See my garden
    </button>
  `;

  const nextBtn = document.getElementById('btn-next-level');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentLevelRef = { islandId: island.id, levelIdx: nextLevelIdx, level: nextLevel };
      startExercise(nextLevel.type);
    });
  }
  const pathBtn = document.getElementById('btn-goto-path');
  if (pathBtn) {
    pathBtn.addEventListener('click', () => {
      const savedIslandId = currentLevelRef ? currentLevelRef.islandId : null;
      currentLevelRef = null;
      state.activeIsland = savedIslandId;
      saveState();
      showScreen('exercises', 'back');
    });
  }
  document.getElementById('btn-goto-garden').addEventListener('click', () => {
    currentLevelRef = null;
    showScreen('garden2', 'back');
  });
}

/* ── EXERCISE 1: TILE MATCHING ──────────────────────────────── */

const TILE_SYMBOLS = [
  { id: 'leaf',    label: 'Leaf',    icon: 'icon-leaf'   },
  { id: 'flower',  label: 'Flower',  icon: 'icon-flower' },
  { id: 'sprout',  label: 'Sprout',  icon: 'icon-sprout' },
  { id: 'water',   label: 'Water',   icon: 'icon-water'  },
  { id: 'sun',     label: 'Sun',     icon: 'icon-sun'    },
  { id: 'bloom',   label: 'Bloom',   icon: 'icon-bloom'  },
  { id: 'seed',    label: 'Seed',    icon: 'icon-seed'   },
  { id: 'pot',     label: 'Pot',     icon: 'icon-pot'    },
  { id: 'garden',  label: 'Garden',  icon: 'icon-garden' },
  { id: 'coin',    label: 'Coin',    icon: 'icon-coin'   },
  { id: 'book',    label: 'Book',    icon: 'icon-book'   },
  { id: 'clock',   label: 'Clock',   icon: 'icon-clock'  },
];

function initTileMatch(level) {
  const pairCount = level ? level.pairs : 8;
  // Track recently served to avoid immediate repeats
  const recent = state.recentlyServed.tiles || [];
  let pool = TILE_SYMBOLS.filter(t => !recent.includes(t.id));
  if (pool.length < pairCount) pool = [...TILE_SYMBOLS];
  const chosen = shuffle(pool).slice(0, pairCount);
  state.recentlyServed.tiles = chosen.map(t => t.id);
  saveState();

  const deck = shuffle([...chosen, ...chosen].map((t, i) => ({ ...t, uid: i })));

  playState.flipped = [];
  playState.matched = 0;
  playState.locked = false;

  const playArea = document.getElementById('play-area');
  const playFooter = document.getElementById('play-footer');

  playArea.innerHTML = `
    <div class="exercise-intro">
      <div class="exercise-intro-title">How to play</div>
      <div class="exercise-intro-body">Tap two tiles to flip them over. If they match, they stay face up. Find all ${pairCount} pairs. Take your time — there is no timer.</div>
    </div>
    <div class="tile-grid" id="tile-grid" style="grid-template-columns:repeat(${pairCount <= 4 ? 4 : pairCount <= 6 ? 4 : 4},1fr)"></div>
  `;

  playFooter.innerHTML = `<div class="round-tracker" id="tile-round-dots" aria-label="Pairs found"></div>`;

  const grid = document.getElementById('tile-grid');
  const dotsEl = document.getElementById('tile-round-dots');

  function updateDots() {
    dotsEl.innerHTML = Array.from({ length: pairCount }, (_, i) =>
      `<div class="round-dot${i < playState.matched ? ' done' : ''}"></div>`
    ).join('');
  }
  updateDots();

  deck.forEach((tile, i) => {
    const el = document.createElement('button');
    el.className = 'tile';
    el.dataset.pairId = tile.id;
    el.setAttribute('aria-label', `Tile ${i + 1} — tap to flip`);
    el.innerHTML = `
      <div class="tile-face tile-back" aria-hidden="true">
        <svg><use href="#icon-leaf"/></svg>
      </div>
      <div class="tile-face tile-front" aria-hidden="true">
        <svg><use href="#${tile.icon}"/></svg>
      </div>
    `;

    el.addEventListener('click', () => {
      if (playState.locked) return;
      if (el.classList.contains('flipped') || el.classList.contains('matched')) return;

      el.classList.add('flipped');
      playState.flipped.push({ el, pairId: tile.id });
      playSelect();

      if (playState.flipped.length === 2) {
        playState.locked = true;
        const [a, b] = playState.flipped;

        setTimeout(() => {
          if (a.pairId === b.pairId) {
            a.el.classList.add('matched');
            b.el.classList.add('matched');
            a.el.setAttribute('aria-label', 'Matched pair');
            b.el.setAttribute('aria-label', 'Matched pair');
            playState.matched++;
            playCoin();
            updateDots();
            if (playState.matched === pairCount) {
              setTimeout(() => completeExercise(6, 'tiles'), 600);
            }
          } else {
            a.el.classList.remove('flipped');
            b.el.classList.remove('flipped');
            playWrong(); playState.mistakes = (playState.mistakes || 0) + 1;
          }
          playState.flipped = [];
          playState.locked = false;
        }, 700);
      }
    });

    grid.appendChild(el);
  });
}

/* ── EXERCISE 2: PATTERN SEQUENCE ──────────────────────────── */

const PATTERN_ITEMS = [
  { label: 'Leaf',   icon: 'icon-leaf',   color: '#73875D' },
  { label: 'Flower', icon: 'icon-flower', color: '#E07A5F' },
  { label: 'Sun',    icon: 'icon-sun',    color: '#E78F37' },
  { label: 'Water',  icon: 'icon-water',  color: '#7B5371' },
];

function initPatternSeq(level) {
  const totalRounds = level ? level.rounds : 4;
  const lengths = Array.from({ length: totalRounds }, (_, i) => 3 + i);

  playState.round = 0;
  playState.totalRounds = totalRounds;
  playState.lengths = lengths;
  playState.sequence = [];
  playState.userSeq = [];

  const playArea = document.getElementById('play-area');
  const playFooter = document.getElementById('play-footer');

  playArea.innerHTML = `
    <div class="exercise-intro">
      <div class="exercise-intro-title">How to play</div>
      <div class="exercise-intro-body">Watch the pattern carefully, then repeat it by tapping the items in the same order. It gets longer each round. Take your time.</div>
    </div>
    <div class="pattern-display" id="pattern-display" aria-label="Pattern display" aria-live="polite"></div>
    <div class="pattern-options" id="pattern-options"></div>
    <div id="pattern-result" aria-live="polite"></div>
  `;

  playFooter.innerHTML = `
    <div class="round-tracker" id="pattern-dots" aria-label="Rounds completed"></div>
    <button class="btn btn-primary btn-lg" id="btn-show-pattern">
      <svg class="icon" aria-hidden="true"><use href="#icon-brain"/></svg>
      Show me the pattern
    </button>
  `;

  updatePatternDots();
  document.getElementById('btn-show-pattern').addEventListener('click', startPatternRound);
}

function updatePatternDots() {
  const el = document.getElementById('pattern-dots');
  if (!el) return;
  el.innerHTML = Array.from({ length: playState.totalRounds }, (_, i) =>
    `<div class="round-dot${i < playState.round ? ' done' : i === playState.round ? ' current' : ''}"></div>`
  ).join('');
}

function startPatternRound() {
  const len = playState.lengths[playState.round];
  playState.sequence = Array.from({ length: len }, () =>
    PATTERN_ITEMS[Math.floor(Math.random() * PATTERN_ITEMS.length)]
  );
  playState.userSeq = [];

  const btn = document.getElementById('btn-show-pattern');
  btn.disabled = true;
  btn.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-clock"/></svg> Watch carefully...`;

  showPatternSequence(() => {
    btn.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-brain"/></svg> Your turn — repeat the pattern`;
    renderPatternOptions();
  });
}

function showPatternSequence(callback) {
  const display = document.getElementById('pattern-display');
  display.innerHTML = '';
  const seq = playState.sequence;
  let idx = 0;

  function showNext() {
    display.innerHTML = '';
    if (idx < seq.length) {
      const item = seq[idx];
      const dot = document.createElement('div');
      dot.className = 'pattern-dot active';
      dot.style.background = item.color;
      dot.setAttribute('aria-label', item.label);
      dot.innerHTML = `<svg class="icon" style="color:#F5EFEB" aria-hidden="true"><use href="#${item.icon}"/></svg>`;
      display.appendChild(dot);
      playSelect();
      idx++;
      setTimeout(showNext, 900);
    } else {
      display.innerHTML = `<p class="pattern-turn-msg">Now repeat what you saw</p>`;
      callback();
    }
  }
  setTimeout(showNext, 500);
}

function renderPatternOptions() {
  const opts = document.getElementById('pattern-options');
  opts.innerHTML = '';

  PATTERN_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'pattern-opt-btn';
    btn.setAttribute('aria-label', item.label);
    btn.style.borderColor = item.color;
    btn.innerHTML = `<svg class="icon icon-lg" style="color:${item.color}" aria-hidden="true"><use href="#${item.icon}"/></svg>`;

    btn.addEventListener('click', () => {
      playState.userSeq.push(item);
      btn.classList.add('selected');
      playSelect();

      const current = playState.userSeq.length - 1;
      const expected = playState.sequence[current];
      const resultEl = document.getElementById('pattern-result');

      if (item.label !== expected.label) {
        resultEl.innerHTML = `<div class="result-row wrong">
          <svg class="icon" aria-hidden="true"><use href="#icon-close"/></svg>
          Not quite — let's try again
        </div>`;
        playWrong(); playState.mistakes = (playState.mistakes || 0) + 1;
        setTimeout(() => {
          resultEl.innerHTML = '';
          playState.userSeq = [];
          document.querySelectorAll('.pattern-opt-btn').forEach(b => b.classList.remove('selected'));
          document.getElementById('btn-show-pattern').innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-brain"/></svg> Show me again`;
          document.getElementById('btn-show-pattern').disabled = false;
          document.getElementById('pattern-options').innerHTML = '';
        }, 1800);
        return;
      }

      if (playState.userSeq.length === playState.sequence.length) {
        resultEl.innerHTML = `<div class="result-row correct">
          <svg class="icon" aria-hidden="true"><use href="#icon-check"/></svg>
          Perfect! Well remembered.
        </div>`;
        playCoin();
        playState.round++;
        updatePatternDots();

        if (playState.round >= playState.totalRounds) {
          setTimeout(() => completeExercise(8, 'pattern'), 1000);
        } else {
          setTimeout(() => {
            resultEl.innerHTML = '';
            playState.userSeq = [];
            document.getElementById('pattern-options').innerHTML = '';
            document.getElementById('pattern-display').innerHTML = '';
            document.getElementById('btn-show-pattern').innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-brain"/></svg> Next round`;
            document.getElementById('btn-show-pattern').disabled = false;
          }, 1500);
        }
      }
    });

    opts.appendChild(btn);
  });
}

/* ── EXERCISE 3: ODD ONE OUT ────────────────────────────────── */

const ODD_SETS = [
  { items: [{ label: 'Rose',    icon: 'icon-flower' }, { label: 'Tulip',   icon: 'icon-flower' }, { label: 'Lily',    icon: 'icon-flower' }, { label: 'Hammer',  icon: 'icon-pot'    }], odd: 'Hammer',  hint: 'Three are flowers, one is a tool.' },
  { items: [{ label: 'Rain',    icon: 'icon-water'  }, { label: 'River',   icon: 'icon-water'  }, { label: 'Ocean',   icon: 'icon-water'  }, { label: 'Fire',    icon: 'icon-streak' }], odd: 'Fire',    hint: 'Three involve water, one is its opposite.' },
  { items: [{ label: 'Sprout',  icon: 'icon-sprout' }, { label: 'Seed',    icon: 'icon-seed'   }, { label: 'Bloom',   icon: 'icon-bloom'  }, { label: 'Clock',   icon: 'icon-clock'  }], odd: 'Clock',   hint: 'Three are plant stages, one measures time.' },
  { items: [{ label: 'Book',    icon: 'icon-book'   }, { label: 'Story',   icon: 'icon-book'   }, { label: 'Poem',    icon: 'icon-book'   }, { label: 'Shovel',  icon: 'icon-pot'    }], odd: 'Shovel',  hint: 'Three are things you read, one is a garden tool.' },
  { items: [{ label: 'Sun',     icon: 'icon-sun'    }, { label: 'Moon',    icon: 'icon-sun'    }, { label: 'Star',    icon: 'icon-sun'    }, { label: 'Soil',    icon: 'icon-pot'    }], odd: 'Soil',    hint: 'Three are in the sky, one is in the ground.' },
  { items: [{ label: 'Leaf',    icon: 'icon-leaf'   }, { label: 'Petal',   icon: 'icon-flower' }, { label: 'Stem',    icon: 'icon-sprout' }, { label: 'Cloud',   icon: 'icon-sun'    }], odd: 'Cloud',   hint: 'Three are parts of a plant, one is in the sky.' },
  { items: [{ label: 'Bread',   icon: 'icon-meal'   }, { label: 'Rice',    icon: 'icon-meal'   }, { label: 'Soup',    icon: 'icon-meal'   }, { label: 'Key',     icon: 'icon-coin'   }], odd: 'Key',     hint: 'Three are foods, one unlocks a door.' },
  { items: [{ label: 'Bird',    icon: 'icon-flower' }, { label: 'Butterfly',icon: 'icon-flower'}, { label: 'Bee',     icon: 'icon-flower' }, { label: 'Rock',    icon: 'icon-pot'    }], odd: 'Rock',    hint: 'Three can fly, one cannot.' },
  { items: [{ label: 'Morning', icon: 'icon-sun'    }, { label: 'Noon',    icon: 'icon-sun'    }, { label: 'Evening', icon: 'icon-sun'    }, { label: 'Garden',  icon: 'icon-garden' }], odd: 'Garden',  hint: 'Three are times of day, one is a place.' },
  { items: [{ label: 'Seed',    icon: 'icon-seed'   }, { label: 'Sprout',  icon: 'icon-sprout' }, { label: 'Tree',    icon: 'icon-leaf'   }, { label: 'Bell',    icon: 'icon-bell'   }], odd: 'Bell',    hint: 'Three grow, one makes sound.' },
  { items: [{ label: 'Tea',     icon: 'icon-meal'   }, { label: 'Coffee',  icon: 'icon-meal'   }, { label: 'Juice',   icon: 'icon-meal'   }, { label: 'Chair',   icon: 'icon-home'   }], odd: 'Chair',   hint: 'Three are drinks, one is furniture.' },
  { items: [{ label: 'Walk',    icon: 'icon-leaf'   }, { label: 'Stretch', icon: 'icon-leaf'   }, { label: 'Dance',   icon: 'icon-leaf'   }, { label: 'Sleep',   icon: 'icon-clock'  }], odd: 'Sleep',   hint: 'Three are exercise, one is rest.' },
  { items: [{ label: 'Piano',   icon: 'icon-sound'  }, { label: 'Violin',  icon: 'icon-sound'  }, { label: 'Drum',    icon: 'icon-sound'  }, { label: 'Brush',   icon: 'icon-pot'    }], odd: 'Brush',   hint: 'Three make music, one is a tool.' },
  { items: [{ label: 'Doctor',  icon: 'icon-profile'}, { label: 'Nurse',   icon: 'icon-profile'}, { label: 'Teacher', icon: 'icon-profile'}, { label: 'Table',   icon: 'icon-home'   }], odd: 'Table',   hint: 'Three are people who help, one is furniture.' },
  { items: [{ label: 'Spring',  icon: 'icon-flower' }, { label: 'Summer',  icon: 'icon-sun'    }, { label: 'Autumn',  icon: 'icon-leaf'   }, { label: 'Garden',  icon: 'icon-garden' }], odd: 'Garden',  hint: 'Three are seasons, one is a place.' },
  { items: [{ label: 'Smile',   icon: 'icon-sound'  }, { label: 'Laugh',   icon: 'icon-sound'  }, { label: 'Sing',    icon: 'icon-sound'  }, { label: 'Stone',   icon: 'icon-pot'    }], odd: 'Stone',   hint: 'Three are joyful actions, one is an object.' },
  { items: [{ label: 'Apple',   icon: 'icon-meal'   }, { label: 'Mango',   icon: 'icon-meal'   }, { label: 'Banana',  icon: 'icon-meal'   }, { label: 'Cloud',   icon: 'icon-sun'    }], odd: 'Cloud',   hint: 'Three are fruits, one is in the sky.' },
  { items: [{ label: 'Read',    icon: 'icon-book'   }, { label: 'Write',   icon: 'icon-book'   }, { label: 'Learn',   icon: 'icon-brain'  }, { label: 'Swim',    icon: 'icon-water'  }], odd: 'Swim',    hint: 'Three use the mind, one uses the body in water.' },
  { items: [{ label: 'Knit',    icon: 'icon-leaf'   }, { label: 'Sew',     icon: 'icon-leaf'   }, { label: 'Weave',   icon: 'icon-leaf'   }, { label: 'Drive',   icon: 'icon-home'   }], odd: 'Drive',   hint: 'Three are crafts with thread, one uses a car.' },
  { items: [{ label: 'Morning walk', icon: 'icon-sun' }, { label: 'Gardening', icon: 'icon-leaf' }, { label: 'Cooking', icon: 'icon-meal' }, { label: 'Television', icon: 'icon-camera' }], odd: 'Television', hint: 'Three are active hobbies, one is passive watching.' },
];

function initOddOneOut(level) {
  const totalRounds = level ? level.rounds : 4;
  // Avoid recently served sets
  const recent = state.recentlyServed.odd || [];
  let pool = ODD_SETS.filter((_, i) => !recent.includes(i));
  if (pool.length < totalRounds) pool = [...ODD_SETS];
  const chosen = shuffle(pool).slice(0, totalRounds);
  state.recentlyServed.odd = chosen.map(s => ODD_SETS.indexOf(s));
  saveState();

  playState.round = 0;
  playState.totalRounds = totalRounds;
  playState.sets = chosen;

  const playArea = document.getElementById('play-area');
  const playFooter = document.getElementById('play-footer');

  playArea.innerHTML = `
    <div class="exercise-intro">
      <div class="exercise-intro-title">How to play</div>
      <div class="exercise-intro-body">Four items appear. Three belong together, one does not. Tap the one that is different. Trust your instincts.</div>
    </div>
    <div class="odd-grid" id="odd-grid"></div>
    <div id="odd-result" aria-live="polite"></div>
  `;

  playFooter.innerHTML = `<div class="round-tracker" id="odd-dots" aria-label="Rounds completed"></div>`;

  updateOddDots();
  renderOddRound();
}

function updateOddDots() {
  const el = document.getElementById('odd-dots');
  if (!el) return;
  el.innerHTML = Array.from({ length: playState.totalRounds }, (_, i) =>
    `<div class="round-dot${i < playState.round ? ' done' : i === playState.round ? ' current' : ''}"></div>`
  ).join('');
}

function renderOddRound() {
  const grid = document.getElementById('odd-grid');
  const resultEl = document.getElementById('odd-result');
  grid.innerHTML = '';
  resultEl.innerHTML = '';

  const set = playState.sets[playState.round % playState.sets.length];
  const shuffled = shuffle(set.items);

  shuffled.forEach(item => {
    const el = document.createElement('button');
    el.className = 'odd-item';
    el.setAttribute('aria-label', item.label);
    el.innerHTML = `
      <svg aria-hidden="true"><use href="#${item.icon}"/></svg>
      <span class="odd-item-label">${item.label}</span>
    `;

    el.addEventListener('click', () => {
      const isCorrect = item.label === set.odd;
      document.querySelectorAll('.odd-item').forEach(b => b.disabled = true);

      if (isCorrect) {
        el.classList.add('correct');
        playCoin();
        resultEl.innerHTML = `<div class="result-row correct">
          <svg class="icon" aria-hidden="true"><use href="#icon-check"/></svg>
          Correct! ${set.hint}
        </div>`;
      } else {
        el.classList.add('wrong');
        document.querySelectorAll('.odd-item').forEach(b => {
          const lbl = b.querySelector('.odd-item-label');
          if (lbl && lbl.textContent === set.odd) b.classList.add('correct');
        });
        playWrong(); playState.mistakes = (playState.mistakes || 0) + 1;
        resultEl.innerHTML = `<div class="result-row wrong">
          <svg class="icon" aria-hidden="true"><use href="#icon-close"/></svg>
          Not quite. ${set.hint}
        </div>`;
      }

      playState.round++;
      updateOddDots();

      setTimeout(() => {
        if (playState.round >= playState.totalRounds) {
          completeExercise(7, 'oddone');
        } else {
          renderOddRound();
        }
      }, 2200);
    });

    grid.appendChild(el);
  });
}

/* ── EXERCISE 4: WORD PAIRS ─────────────────────────────────── */

const WORD_PAIR_SETS = [
  [{ word: 'Bread',   match: 'Butter'   }, { word: 'Rain',    match: 'Umbrella' }, { word: 'Lock',    match: 'Key'      }, { word: 'Song',    match: 'Dance'    }],
  [{ word: 'Seed',    match: 'Soil'     }, { word: 'Moon',    match: 'Stars'    }, { word: 'Tea',     match: 'Cup'      }, { word: 'Book',    match: 'Page'     }],
  [{ word: 'Sun',     match: 'Light'    }, { word: 'Bird',    match: 'Nest'     }, { word: 'River',   match: 'Bridge'   }, { word: 'Flower',  match: 'Garden'   }],
  [{ word: 'Piano',   match: 'Music'    }, { word: 'Pen',     match: 'Paper'    }, { word: 'Salt',    match: 'Pepper'   }, { word: 'Night',   match: 'Day'      }],
  [{ word: 'Doctor',  match: 'Hospital' }, { word: 'Teacher', match: 'School'   }, { word: 'Farmer',  match: 'Field'    }, { word: 'Chef',    match: 'Kitchen'  }],
  [{ word: 'Winter',  match: 'Cold'     }, { word: 'Summer',  match: 'Hot'      }, { word: 'Spring',  match: 'Bloom'    }, { word: 'Autumn',  match: 'Leaves'   }],
  [{ word: 'Needle',  match: 'Thread'   }, { word: 'Brush',   match: 'Paint'    }, { word: 'Knife',   match: 'Fork'     }, { word: 'Cup',     match: 'Saucer'   }],
  [{ word: 'Shoes',   match: 'Feet'     }, { word: 'Hat',     match: 'Head'     }, { word: 'Gloves',  match: 'Hands'    }, { word: 'Ring',    match: 'Finger'   }],
  [{ word: 'Cat',     match: 'Kitten'   }, { word: 'Dog',     match: 'Puppy'    }, { word: 'Hen',     match: 'Chick'    }, { word: 'Cow',     match: 'Calf'     }],
  [{ word: 'Ocean',   match: 'Wave'     }, { word: 'Forest',  match: 'Tree'     }, { word: 'Desert',  match: 'Sand'     }, { word: 'Mountain',match: 'Peak'     }],
  [{ word: 'Clock',   match: 'Time'     }, { word: 'Scale',   match: 'Weight'   }, { word: 'Ruler',   match: 'Length'   }, { word: 'Thermometer', match: 'Temperature' }],
  [{ word: 'Smile',   match: 'Happy'    }, { word: 'Cry',     match: 'Sad'      }, { word: 'Laugh',   match: 'Joy'      }, { word: 'Hug',     match: 'Love'     }],
];

function initWordPairs(level) {
  const setCount = level ? level.sets : 1;
  // Pick N sets based on level
  const recent = state.recentlyServed.words || [];
  let pool = WORD_PAIR_SETS.filter((_, i) => !recent.includes(i));
  if (pool.length < setCount) pool = [...WORD_PAIR_SETS];
  const chosen = shuffle(pool).slice(0, Math.min(setCount, pool.length));
  state.recentlyServed.words = chosen.map(s => WORD_PAIR_SETS.indexOf(s));
  saveState();

  // Flatten all pairs from chosen sets
  const allPairs = chosen.flat();
  const pairCount = allPairs.length;

  const lefts  = allPairs.map(p => ({ id: p.word, text: p.word,  side: 'left'  }));
  const rights = allPairs.map(p => ({ id: p.word, text: p.match, side: 'right' }));
  const deck   = shuffle([...lefts, ...rights]);

  playState.selected = null;
  playState.matchedPairs = 0;
  playState.totalPairs = pairCount;

  const playArea = document.getElementById('play-area');
  const playFooter = document.getElementById('play-footer');

  playArea.innerHTML = `
    <div class="exercise-intro">
      <div class="exercise-intro-title">How to play</div>
      <div class="exercise-intro-body">Tap a word, then tap the word that goes with it. Find all ${pairCount} pairs. There is no wrong answer penalty — just keep trying.</div>
    </div>
    <div class="word-pairs" id="word-pairs"></div>
  `;

  playFooter.innerHTML = `<div class="round-tracker" id="word-dots" aria-label="Pairs found"></div>`;

  updateWordDots(0, pairCount);

  const grid = document.getElementById('word-pairs');

  deck.forEach(item => {
    const el = document.createElement('button');
    el.className = 'word-card';
    el.dataset.pairId = item.id;
    el.dataset.side = item.side;
    el.textContent = item.text;
    el.setAttribute('aria-label', item.text);

    el.addEventListener('click', () => {
      if (el.classList.contains('matched')) return;

      if (playState.selected === null) {
        el.classList.add('selected');
        playState.selected = { el, pairId: item.id, side: item.side };
        playSelect();
        return;
      }

      const prev = playState.selected;
      if (prev.el === el) {
        el.classList.remove('selected');
        playState.selected = null;
        return;
      }

      const isMatch = prev.pairId === item.id && prev.side !== item.side;

      if (isMatch) {
        prev.el.classList.remove('selected');
        prev.el.classList.add('matched');
        el.classList.add('matched');
        playState.selected = null;
        playState.matchedPairs++;
        playCoin();
        updateWordDots(playState.matchedPairs, pairCount);

        if (playState.matchedPairs === pairCount) {
          setTimeout(() => completeExercise(6, 'words'), 600);
        }
      } else {
        el.classList.add('selected');
        setTimeout(() => {
          prev.el.classList.remove('selected');
          el.classList.remove('selected');
          playState.selected = null;
        }, 600);
        playWrong(); playState.mistakes = (playState.mistakes || 0) + 1;
      }
    });

    grid.appendChild(el);
  });
}

function updateWordDots(done, total) {
  const el = document.getElementById('word-dots');
  if (!el) return;
  el.innerHTML = Array.from({ length: total }, (_, i) =>
    `<div class="round-dot${i < done ? ' done' : ''}"></div>`
  ).join('');
}

/* ════════════════════════════════════════════════════════════
   MAHJONG KAKIS: the kopitiam table
   ════════════════════════════════════════════════════════════

   Ported from archive/mahjong-kakis/ (game.js, kakis.js, tiles.js and
   content/kaki-banter.json). That build was four ES modules plus a fetched JSON
   bank. This is a section of one classic script, so the modules are folded in
   and the bank is inlined. Nothing here fetches, which is why sw.js needs no
   new shell entries and why the table plays on a first offline load.

   Face-up tiles, tap two that match, clear the table. No timers anywhere: the
   only counter is taps since the last match, and all it does is ask a kaki to
   offer a hint. A mismatch is a warm moment, never an error.
   ──────────────────────────────────────────────────────────── */

/* ── THE AI SEAM ────────────────────────────────────────────── */

/*
  ============================ SWAP POINT ============================
  kakiGenerate is the one function a real LLM replaces. When Tencent Cloud
  (or any provider) is wired in, rewrite ONLY the body to make the call and
  keep this exact signature:

      kakiGenerate({ event, context }) -> Promise<{ text, meta }>

  It is already async and already returns a promise, so no call site has to
  change. KAKI_BANTER then becomes the offline fallback for when the network is
  gone: try the model, catch, fall through to the bank. meta.source is how the
  UI and the demo tell the two apart, so keep setting it ("bank", "fallback",
  and later "llm").
  ====================================================================

  Determinism note: template picks are seeded per event call count, so the Nth
  call of an event in a page load lands on the same template every session. The
  two greetings fire once per load, so they pass context.seed with per-visit
  entropy instead, a hash of the name and the visit number. Without it, every
  new player on earth would meet the same sentence forever.
*/

const KAKI_BANTER = {
  first_visit__lily: [
    'Welcome {name}, sit here. Two same tiles, tap both.',
    'Hello {name}, so nice you came. Find two that match.',
    'Come {name}, the table is warm. All tiles are face up.',
    'First time {name}? Tap one tile, then tap its twin.',
    'Sit here {name}, plenty of room. Two same tiles, tap both.',
    'Hello {name}. Nothing to lose here. Find two that match.',
    'New face {name}, how nice. We go at your own pace.',
  ],
  first_visit__beng: [
    'Oi {name}, new face. Two same tiles, tap tap, gone.',
    'Sit down {name}, kopi just came. Tap two same tiles.',
    'Eh {name}, welcome. No rush, the tiles cannot run.',
    'First time {name}? Find two same tiles and tap both.',
    'Wah {name}, new kaki. Two same tiles, tap tap, done.',
    'Oi {name}, sit sit. Find two same tiles, that is all.',
    'Relax {name}, nobody counting here. Play how you like.',
  ],
  first_visit__rose: [
    'Welcome {name}. Breathe, then find two tiles that match.',
    'Sit slowly {name}. Nice to have new company here.',
    'Hello {name}. Two tiles that look alike, tap both.',
    'Come {name}, no hurry at all. The tiles will wait.',
    'Hello {name}. Look for two tiles that match, no rush.',
    'Sit with us {name}. Two same tiles, tap both. That is all.',
    'Come {name}. Pick any tile, then look for its twin.',
  ],
  round_start__lily: [
    'Eh {name}, come sit. All the tiles are face up.',
    'Wah {name}, good you came. Two same tiles, tap both.',
    'Morning {name}. Find two tiles that match.',
    'Come {name}, the table is warm. Tap a pair and see.',
    'Sit beside me {name}. Every tile is waiting for its twin.',
  ],
  round_start__beng: [
    'Oi {name}, my kopi just came. Tap two same tiles.',
    'Sit down {name}. Two same tiles, tap tap, they gone.',
    'Aiyoh {name}, you again. Good, now I have company.',
    'Eh {name}, table is set. Match two same tiles.',
    'This seat I chope for you {name}.',
  ],
  round_start__rose: [
    'Sit slowly {name}. No hurry, the tiles will wait.',
    'Welcome {name}. Find two tiles that look alike.',
    'Take a breath {name}. Then find one pair, any pair.',
    'Sit down {name}. We play slow here, no hurry.',
    'One pair at a time {name}. Two same tiles, tap both.',
  ],
  match_found__lily: [
    'There you go {name}. Clean pair.',
    'Wah {name}, your eyes so sharp.',
    'Nice one {name}. That pair was hiding also.',
    'See {name}, they match. Two friends going home.',
    'That one beautiful {name}.',
    'Aiyoh so nice {name}, they found each other again.',
    'One more pair home {name}. The table is smiling.',
  ],
  match_found__beng: [
    'Steady lah {name}. Faster than my kopi cooling.',
    'Oi {name}, you sure you never play before?',
    'Wah {name}, that one even I never spot.',
    'Aiyoh {name}, so quick. My toast not finished yet.',
    'Steady {name}.',
    'Eh {name}, at this rate my kaya toast going cold sia.',
    'Wah {name}, spot on. My newspaper also not open yet.',
  ],
  match_found__rose: [
    'Slow and sure {name}. That is how pairs come.',
    'Good {name}. One down, the rest will follow.',
    'Nice {name}. Like finding the right stitch, no rush.',
    'That was patient work {name}. Well done.',
    'Two stitches, one row {name}. Just like that.',
    'Good eye {name}.',
    'Steady hands {name}. The pairs come when you look.',
  ],
  near_miss__lily: [
    'Close one {name}. Those two sit very near.',
    'Aiyoh, so near {name}. Try the one beside it.',
    'Never mind {name}, they really do look alike.',
    'Almost {name}. Maybe the twin is in the corner.',
    'So close {name}.',
    'Wah {name}, these two nearly fooled me also.',
    'Nearly there {name}. The real twin is still on the table.',
  ],
  near_miss__beng: [
    'Those two look like brothers {name}. Not twins.',
    'Aiyoh {name}, even I thought that pair matched.',
    'Close leh {name}. Take your time, my kopi still hot.',
    'Tricky one {name}. These tiles very naughty ah.',
    'Not twins lah {name}.',
    'That pair sneaky {name}, like the last curry puff.',
    'Eh {name}, that one only looks the same. Try again lah.',
  ],
  near_miss__rose: [
    'Not that pair {name}. Look slowly, they will show.',
    'No harm done {name}. Even my knitting drops a stitch.',
    'Those two are cousins {name}, not twins. Look again.',
    'It is alright {name}. Nothing spoiled, look again.',
    'Nothing lost {name}.',
    'Look once more {name}. The right twin is on this table.',
    'Set that pair aside {name}. Another one is waiting.',
  ],
  round_win__lily: [
    'Table cleared {name}. Every tile went home.',
    'Wah {name}, all gone. Beautiful.',
    'Well done {name}. That was a warm round.',
    'See {name}, all matched. I am very happy today.',
    'Every single pair {name}. I am clapping already.',
    'Look at that {name}, all matched. So tidy now.',
    'You cleared the whole table {name}. Wonderful.',
  ],
  round_win__beng: [
    'Wah {name}, table clean. Who buying the next kopi?',
    'Steady {name}. I lost count halfway already.',
    'All gone {name}. My toast also not finished.',
    'Aiyoh {name}, so clean. Next time I bring glasses.',
    'Clean table {name}.',
    'Aiyoh {name}, finish already? My kopi still half full.',
    'Table swept {name}. Even the tiles going home early.',
  ],
  round_win__rose: [
    'All the pairs found {name}. Nice and steady.',
    'There {name}, the table is quiet again. Good work.',
    'Finished {name}. Like casting off the last row.',
    'A calm round {name}. Thank you for the company.',
    'The whole table {name}, every pair back home.',
    'Every pair home {name}. Quiet table, quiet heart.',
    'Done {name}. Slow hands still finish the whole row.',
  ],
  idle_nudge__lily: [
    'Take your time {name}. The tiles not going anywhere.',
    'Still looking {name}? Start from the top row.',
    'Try the left side first {name}. Just a hunch.',
    'No rush {name}.',
    'Try the corners {name}. Pairs like to hide there.',
    'One row at a time {name}. No prize for rushing.',
  ],
  idle_nudge__beng: [
    'Eh {name}, my kopi getting cold, but you carry on.',
    'No rush {name}. I also stare blur blur sometimes.',
    'Try the bottom row {name}. I always find one there.',
    'My eyes also blur {name}.',
    'Eh {name}, scan the middle. That row always tricky.',
    'Sit back a bit {name}. Sometimes the pair jumps out.',
  ],
  idle_nudge__rose: [
    'Slowly {name}. Look at one tile, then find its twin.',
    'No hurry {name}. The table has all day.',
    'Rest your eyes a moment {name}, then look again.',
    'Pick one tile {name}, then look for its twin.',
    'Look at one row {name}, then the next. Slowly is fine.',
    'Breathe {name}. The pair is there, waiting to be seen.',
  ],
  return_visit__lily: [
    'You came back {name}. Last time we played {rounds} together.',
    'Wah {name}, we played {rounds} already.',
    'Eh {name}, I remember {best}, you know.',
    'Wah {name}, I never forget {best} hor.',
    'I kept your seat {name}. We sat here {rounds} before.',
    'You are back {name}. We played {rounds} at this table.',
    'Your seat is here {name}. I remember {best}.',
  ],
  return_visit__beng: [
    'Oi {name}, back so soon? We played {rounds} last time.',
    'Aiyoh {name}, I remember {best} sia.',
    'I chope your seat {name}. We finished {rounds} together.',
    'Steady {name}. I never forget {best} lah.',
    'Eh {name}, kopi first. We played {rounds} sia.',
    'Wah {name}, back again. We played {rounds} together already.',
    'Long time {name}. I remember {best} hor.',
  ],
  return_visit__rose: [
    'Good to see you {name}. We played {rounds} together already.',
    'Come sit {name}. We finished {rounds} together.',
    'Come {name}, I remember {best}, really.',
    'Come and sit {name}. I remember {best}.',
    'Welcome back {name}. We played {rounds} at this table.',
    'Sit here {name}. I remember {best} well.',
    'Same seat {name}. I still remember {best}.',
  ],
};

const KAKI_NEUTRAL_LINE = 'Take your time. There is no wrong answer here.';
const KAKI_SLOT_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

const kakiLastPick = {};
const kakiCallCount = {};

/** Stable 32 bit hash (FNV-1a). Turns any name into a seed. */
function hashString(value) {
  const text = value === undefined || value === null ? '' : String(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic PRNG (mulberry32). Same seed, same sequence, every time. */
function makeRng(seed) {
  let s = typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : hashString(seed);
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kakiPickIndex(key, length, seed) {
  const turn = (kakiCallCount[key] || 0) + 1;
  kakiCallCount[key] = turn;

  const seedSource = seed === undefined || seed === null ? key + '#' + turn : String(seed);
  const rng = makeRng(hashString(seedSource));

  let index = Math.floor(rng() * length);
  if (index >= length) index = length - 1;
  if (index < 0) index = 0;

  // Nobody wants the same sentence twice running.
  if (length > 1 && index === kakiLastPick[key]) index = (index + 1) % length;
  kakiLastPick[key] = index;
  return index;
}

/* A missing slot leaves a hole rather than a visible {placeholder}. This closes
   the gap so the sentence still reads like a sentence. */
function kakiTidy(text) {
  return text
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function kakiFillSlots(template, context) {
  const missing = [];
  const raw = String(template).replace(KAKI_SLOT_PATTERN, (match, slot) => {
    const value = context[slot];
    if (value === undefined || value === null || value === '') {
      missing.push(slot);
      return '';
    }
    return String(value);
  });
  return { text: kakiTidy(raw), missing };
}

/* Never throws. A round mid-play must not die because a template was missing. */
async function kakiGenerate(request) {
  const input = request === null || typeof request !== 'object' ? {} : request;
  const event = typeof input.event === 'string' ? input.event : '';
  const context = input.context === null || typeof input.context !== 'object' ? {} : input.context;

  const templates = Array.isArray(KAKI_BANTER[event]) ? KAKI_BANTER[event] : null;
  if (templates === null || templates.length === 0) {
    return { text: KAKI_NEUTRAL_LINE, meta: { source: 'fallback', event, templateIndex: -1, missingSlots: [] } };
  }

  const index = kakiPickIndex(event, templates.length, context.seed);
  const filled = kakiFillSlots(templates[index], context);
  return { text: filled.text, meta: { source: 'bank', event, templateIndex: index, missingSlots: filled.missing } };
}

/* ── TILE CATALOGUE ─────────────────────────────────────────── */

/* Twelve identities: dots 1 to 4, bamboo 1 to 4, and the four winds. Faces are
   plain SVG shapes drawn in a near-square 60 by 66 box so they scale with the
   tile. Every colour is a token from the botanical palette. The archived build
   drew dots in the Scam Dojo blue and bamboo in the Memory Garden green, and
   neither of those exists here. */

const KAKI_FACE_BOX = '0 0 60 66';

const KAKI_DOT_LAYOUT = {
  1: [[30, 33, 17]],
  2: [[30, 18, 12], [30, 48, 12]],
  3: [[16, 17, 10], [30, 33, 10], [44, 49, 10]],
  4: [[18, 19, 11], [42, 19, 11], [18, 47, 11], [42, 47, 11]],
};

const KAKI_BAMBOO_LAYOUT = {
  1: [[22, 16]],
  2: [[13, 13], [34, 13]],
  3: [[6, 11], [24.5, 11], [43, 11]],
  4: [[6, 9], [19, 9], [32, 9], [45, 9]],
};

const KAKI_WINDS = [
  { key: 'east',  glyph: '東', label: 'East wind' },
  { key: 'south', glyph: '南', label: 'South wind' },
  { key: 'west',  glyph: '西', label: 'West wind' },
  { key: 'north', glyph: '北', label: 'North wind' },
];

const KAKI_COUNT_WORD = ['Zero', 'One', 'Two', 'Three', 'Four'];

function kakiFace(inner) {
  return `<svg viewBox="${KAKI_FACE_BOX}" aria-hidden="true" focusable="false">${inner}</svg>`;
}

function kakiDotsFace(rank) {
  const marks = KAKI_DOT_LAYOUT[rank].map(([cx, cy, r]) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--kaki-dots)"></circle>` +
    `<circle cx="${cx}" cy="${cy}" r="${(r * 0.4).toFixed(1)}" fill="var(--bg-surface)"></circle>`
  ).join('');
  return kakiFace(marks);
}

function kakiBambooFace(rank) {
  const sticks = KAKI_BAMBOO_LAYOUT[rank].map(([x, w]) =>
    `<rect x="${x}" y="10" width="${w}" height="46" rx="${w / 2}" fill="var(--kaki-bamboo)"></rect>`
  ).join('');
  return kakiFace(sticks);
}

function kakiWindFace(glyph) {
  return kakiFace(
    `<text x="30" y="34" text-anchor="middle" dominant-baseline="central" ` +
    `font-size="42" font-weight="700" fill="var(--kaki-wind)">${glyph}</text>`
  );
}

const KAKI_TILE_SET = (() => {
  const set = [];
  for (let rank = 1; rank <= 4; rank++) {
    set.push({ id: `dots-${rank}`, label: `${KAKI_COUNT_WORD[rank]}${rank === 1 ? ' dot' : ' dots'}`, suit: 'dots', rank, svg: kakiDotsFace(rank) });
  }
  for (let rank = 1; rank <= 4; rank++) {
    set.push({ id: `bamboo-${rank}`, label: `${KAKI_COUNT_WORD[rank]} bamboo`, suit: 'bamboo', rank, svg: kakiBambooFace(rank) });
  }
  KAKI_WINDS.forEach(w => {
    set.push({ id: `wind-${w.key}`, label: w.label, suit: 'winds', rank: null, svg: kakiWindFace(w.glyph) });
  });
  return set;
})();

const KAKI_TILE_BY_ID = new Map(KAKI_TILE_SET.map(t => [t.id, t]));

function kakiSeededShuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = list[i];
    list[i] = list[j];
    list[j] = swap;
  }
  return list;
}

function kakiTouchesUsed(id, used) {
  const tile = KAKI_TILE_BY_ID.get(id);
  if (!tile || tile.rank === null) return false;
  return used.has(`${tile.suit}-${tile.rank - 1}`) || used.has(`${tile.suit}-${tile.rank + 1}`);
}

/**
 * Build a shuffled wall of face-up tiles.
 * `lookalike` 0 to 1 is the share of chosen identities that should sit next to a
 * same-suit neighbouring rank, which is what makes two tiles easy to mix up.
 * Neighbours arrive in couples, so the count is floored.
 */
function buildKakiWall(options) {
  const opts = options === null || typeof options !== 'object' ? {} : options;
  const maxTiles = KAKI_TILE_SET.length * 2;
  const asked = Number.isFinite(opts.tileCount) ? Math.floor(opts.tileCount) : 8;
  const tileCount = Math.max(2, Math.min(maxTiles, asked - (asked % 2)));
  const pairCount = tileCount / 2;

  const asksLookalike = Number.isFinite(opts.lookalike) ? opts.lookalike : 0;
  const lookalike = Math.max(0, Math.min(1, asksLookalike));
  const couplesWanted = Math.floor((pairCount * lookalike) / 2);

  const rng = makeRng(opts.seed);

  const couples = [];
  ['dots', 'bamboo'].forEach(suit => {
    for (let rank = 1; rank <= 3; rank++) couples.push([`${suit}-${rank}`, `${suit}-${rank + 1}`]);
  });
  kakiSeededShuffle(couples, rng);

  const chosen = [];
  const used = new Set();

  for (let i = 0; i < couples.length; i++) {
    if (chosen.length / 2 >= couplesWanted || chosen.length + 2 > pairCount) break;
    const pair = couples[i];
    if (used.has(pair[0]) || used.has(pair[1])) continue;
    chosen.push(pair[0], pair[1]);
    used.add(pair[0]);
    used.add(pair[1]);
  }

  const rest = KAKI_TILE_SET.map(t => t.id).filter(id => !used.has(id));
  kakiSeededShuffle(rest, rng);

  while (chosen.length < pairCount && rest.length > 0) {
    let pick = rest.findIndex(id => !kakiTouchesUsed(id, used));
    if (pick === -1) pick = 0;
    const id = rest.splice(pick, 1)[0];
    chosen.push(id);
    used.add(id);
  }

  const wall = [];
  chosen.forEach(id => {
    const tile = KAKI_TILE_BY_ID.get(id);
    wall.push(tile, tile);
  });
  return kakiSeededShuffle(wall, rng);
}

/* ── THE THREE KAKIS ────────────────────────────────────────── */

/* Only one of them talks at a time. Affinity decides who owns a moment (Lily
   softens a near miss, Beng crows over a win, Rose nudges), everything else
   rotates, and nobody speaks twice in a row.

   No line ever erases itself. There is no timer here: a kaki's words stay on the
   table until the next line replaces them or the player taps the bubble to put
   it away. A tap fades the bubble and the words stay in the DOM, so the slot
   keeps the height it was measured at and nothing below it moves. */

const KAKI_ARROW_X = ['16.6%', '50%', '83.4%'];

/* A very first hello is Lily's, because hers are the lines that teach the rule.
   The hello a returning player gets is deliberately not on this list: it belongs
   to the seated rotation, so a different face meets them each time. */
const KAKI_AFFINITY = {
  first_visit: 'lily',
  near_miss: 'lily',
  round_win: 'beng',
  idle_nudge: 'rose',
};

function kakiPortrait(inner) {
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">` +
    `<circle cx="50" cy="50" r="50" fill="var(--bg-inset)"></circle>${inner}</svg>`;
}

// Auntie Lily: flower tucked in her hair, floral collar, big warm smile.
function kakiLilyPortrait() {
  const petals = [[0, -9], [8.6, -2.8], [5.3, 7.3], [-5.3, 7.3], [-8.6, -2.8]]
    .map(o => `<circle cx="${75 + o[0]}" cy="${30 + o[1]}" r="5.6" fill="var(--kaki-lily-flower)"></circle>`)
    .join('');
  return kakiPortrait(
    '<path d="M12 100 C12 79 29 69 50 69 C71 69 88 79 88 100 Z" fill="var(--kaki-lily-shirt)" stroke="var(--border-strong)" stroke-width="2"></path>' +
    '<circle cx="38" cy="80" r="4" fill="var(--kaki-lily-flower)"></circle>' +
    '<circle cx="50" cy="84" r="4" fill="var(--kaki-lily-flower)"></circle>' +
    '<circle cx="62" cy="80" r="4" fill="var(--kaki-lily-flower)"></circle>' +
    '<circle cx="50" cy="46" r="24" fill="var(--kaki-skin)" stroke="var(--border-strong)" stroke-width="2"></circle>' +
    '<path d="M25 46 C25 26 37 17 50 17 C63 17 75 26 75 46 C70 36 62 31 50 31 C38 31 30 36 25 46 Z" fill="var(--kaki-hair-dark)"></path>' +
    petals +
    '<circle cx="75" cy="30" r="4.4" fill="var(--kaki-flower-heart)"></circle>' +
    '<circle cx="41" cy="46" r="3" fill="var(--kaki-hair-dark)"></circle>' +
    '<circle cx="59" cy="46" r="3" fill="var(--kaki-hair-dark)"></circle>' +
    '<path d="M39 55 Q50 65 61 55" fill="none" stroke="var(--kaki-hair-dark)" stroke-width="3" stroke-linecap="round"></path>'
  );
}

// Uncle Beng: cap with a brim, singlet, kopi in hand.
function kakiBengPortrait() {
  return kakiPortrait(
    '<path d="M14 100 C14 80 31 70 50 70 C69 70 86 80 86 100 Z" fill="var(--kaki-skin)" stroke="var(--border-strong)" stroke-width="2"></path>' +
    '<path d="M39 70 L45 70 L45 84 L39 84 Z" fill="var(--bg-surface)" stroke="var(--border-strong)" stroke-width="2"></path>' +
    '<path d="M55 70 L61 70 L61 84 L55 84 Z" fill="var(--bg-surface)" stroke="var(--border-strong)" stroke-width="2"></path>' +
    '<path d="M36 100 L36 82 Q50 78 64 82 L64 100 Z" fill="var(--bg-surface)" stroke="var(--border-strong)" stroke-width="2"></path>' +
    '<circle cx="50" cy="48" r="24" fill="var(--kaki-skin)" stroke="var(--border-strong)" stroke-width="2"></circle>' +
    '<path d="M27 42 C27 26 38 18 50 18 C62 18 73 26 73 42 Z" fill="var(--kaki-beng-cap)"></path>' +
    '<rect x="21" y="39" width="58" height="7" rx="3.5" fill="var(--kaki-beng-cap)"></rect>' +
    '<circle cx="42" cy="54" r="3" fill="var(--kaki-hair-dark)"></circle>' +
    '<circle cx="60" cy="54" r="3" fill="var(--kaki-hair-dark)"></circle>' +
    '<path d="M40 62 Q51 71 62 60" fill="none" stroke="var(--kaki-hair-dark)" stroke-width="3" stroke-linecap="round"></path>' +
    '<path d="M66 76 L82 76 L79 89 L69 89 Z" fill="var(--kaki-beng-cup)" stroke="var(--border-strong)" stroke-width="2"></path>' +
    '<ellipse cx="74" cy="76" rx="8" ry="3" fill="var(--kaki-kopi)"></ellipse>'
  );
}

// Auntie Rose: grey bun, round glasses, yarn and needles resting on her lap.
function kakiRosePortrait() {
  return kakiPortrait(
    '<path d="M13 100 C13 80 30 70 50 70 C70 70 87 80 87 100 Z" fill="var(--kaki-rose-shirt)" stroke="var(--border-strong)" stroke-width="2"></path>' +
    '<circle cx="50" cy="16" r="11" fill="var(--kaki-hair-grey)" stroke="var(--border-strong)" stroke-width="2"></circle>' +
    '<circle cx="50" cy="48" r="24" fill="var(--kaki-skin)" stroke="var(--border-strong)" stroke-width="2"></circle>' +
    '<path d="M26 48 C26 30 37 22 50 22 C63 22 74 30 74 48 C69 40 61 36 50 36 C39 36 31 40 26 48 Z" fill="var(--kaki-hair-grey)"></path>' +
    '<circle cx="39" cy="50" r="9.5" fill="none" stroke="var(--kaki-hair-dark)" stroke-width="2.6"></circle>' +
    '<circle cx="61" cy="50" r="9.5" fill="none" stroke="var(--kaki-hair-dark)" stroke-width="2.6"></circle>' +
    '<path d="M48.5 50 L51.5 50" stroke="var(--kaki-hair-dark)" stroke-width="2.6" stroke-linecap="round"></path>' +
    '<circle cx="39" cy="50" r="2.6" fill="var(--kaki-hair-dark)"></circle>' +
    '<circle cx="61" cy="50" r="2.6" fill="var(--kaki-hair-dark)"></circle>' +
    '<path d="M42 62 Q50 68 58 62" fill="none" stroke="var(--kaki-hair-dark)" stroke-width="3" stroke-linecap="round"></path>' +
    '<path d="M17 87 L36 71" stroke="var(--text-muted)" stroke-width="3" stroke-linecap="round"></path>' +
    '<path d="M19 71 L36 87" stroke="var(--text-muted)" stroke-width="3" stroke-linecap="round"></path>' +
    '<circle cx="25" cy="84" r="8" fill="var(--kaki-lily-shirt)" stroke="var(--border-strong)" stroke-width="2"></circle>'
  );
}

const KAKIS = [
  { id: 'lily', name: 'Auntie Lily', honorific: 'Auntie ', shortName: 'Lily', portrait: kakiLilyPortrait },
  { id: 'beng', name: 'Uncle Beng',  honorific: 'Uncle ',  shortName: 'Beng', portrait: kakiBengPortrait },
  { id: 'rose', name: 'Auntie Rose', honorific: 'Auntie ', shortName: 'Rose', portrait: kakiRosePortrait },
];

function kakiIndexOf(id) {
  for (let i = 0; i < KAKIS.length; i++) if (KAKIS[i].id === id) return i;
  return 0;
}

let kakiBanterState = { lastId: null, rotation: -1, turn: 0 };

/* Which chair the rotation starts from. Seated off the visit count, so the kaki
   who says hello changes from one visit to the next instead of Lily opening the
   door every single time. */
function kakiSeat(visits) {
  const whole = Number.isFinite(visits) ? Math.floor(visits) : 0;
  kakiBanterState.rotation = ((whole % KAKIS.length) + KAKIS.length) % KAKIS.length;
  kakiBanterState.lastId = null;
}

function kakiPick(event) {
  const preferred = KAKI_AFFINITY[event];
  if (preferred && preferred !== kakiBanterState.lastId) return KAKIS[kakiIndexOf(preferred)];
  for (let i = 0; i < KAKIS.length; i++) {
    kakiBanterState.rotation = (kakiBanterState.rotation + 1) % KAKIS.length;
    if (KAKIS[kakiBanterState.rotation].id !== kakiBanterState.lastId) return KAKIS[kakiBanterState.rotation];
  }
  return KAKIS[Math.max(0, kakiBanterState.rotation)];
}

function kakiShow(kaki, event, text) {
  const bubble = document.getElementById('kaki-bubble');
  const nameEl = document.getElementById('kaki-bubble-name');
  const textEl = document.getElementById('kaki-bubble-text');
  kakiBanterState.lastId = kaki.id;

  KAKIS.forEach(k => {
    const slot = document.querySelector(`[data-kaki-slot="${k.id}"]`);
    if (slot) slot.classList.toggle('is-speaking', k.id === kaki.id);
  });

  if (!bubble || !nameEl || !textEl) return;
  nameEl.textContent = kaki.name;
  textEl.textContent = text;
  bubble.style.setProperty('--kaki-arrow-x', KAKI_ARROW_X[kakiIndexOf(kaki.id)] || '50%');
  bubble.dataset.event = event;
  bubble.dataset.kaki = kaki.id;
  bubble.disabled = false;

  // A taller line may grow the slot. Nothing may shrink it until the next wall,
  // so the table below can only ever be pushed down by something the player did.
  latchKakiSlotFloor();
}

/* Putting a line away is a fade, not a delete. The words stay in the box so the
   box keeps its height, and the tiles under it do not move a pixel. */
function kakiDismiss() {
  const bubble = document.getElementById('kaki-bubble');
  if (bubble) {
    delete bubble.dataset.event;
    delete bubble.dataset.kaki;
    bubble.disabled = true;
  }
  KAKIS.forEach(k => {
    const slot = document.querySelector(`[data-kaki-slot="${k.id}"]`);
    if (slot) slot.classList.remove('is-speaking');
  });
}

/** Say one line for a moment in the round. */
async function kakiSpeak(event, context) {
  const kaki = kakiPick(event);
  const mine = kakiBanterState.turn + 1;
  kakiBanterState.turn = mine;
  const line = await kakiGenerate({ event: `${event}__${kaki.id}`, context: context || {} });
  // A newer line was asked for while this one was in flight. Drop the stale one.
  if (mine !== kakiBanterState.turn) return null;
  kakiShow(kaki, event, line.text);
  return { kaki: kaki.id, text: line.text };
}

/* ── THE PLAYER'S PROFILE AT THIS TABLE ─────────────────────── */

const KAKI_RECENT_KEPT = 3;
const KAKI_MIN_PAIRS = 4;
const KAKI_MAX_PAIRS = 8;
const KAKI_MAX_SHIFT = 1;
const KAKI_MIN_LOOKALIKE = 0.25;
const KAKI_MAX_LOOKALIKE = 1;
const KAKI_LOOKALIKE_STEP = 0.25;
/* Miss rate below FLOWING means the pairs are coming easily, above WORKING means
   the player is working for them. Between the two, nothing changes. */
const KAKI_FLOWING = 0.2;
const KAKI_WORKING = 0.45;
/* From here up, the table is four rows and the page has to close up around it. */
const KAKI_BIG_WALL = 14;

const KAKI_CLEAR_MS = 240;
const KAKI_MISS_HOLD_MS = 600;
const KAKI_NUDGE_TAPS = 6;
/* Two offers of help in a row with nothing found in between, and one pair
   breathes for a moment. Never named, never written down, never a fail state. */
const KAKI_GLOW_AFTER_NUDGES = 2;
const KAKI_GLOW_MS = 900;
/* Long enough to read the win line before the completion card takes the screen. */
const KAKI_WIN_HOLD_MS = 1500;

const KAKI_NAME_CHIPS = ['Ah Ma', 'Ah Gong', 'Auntie', 'Uncle'];

function blankKakis() {
  return {
    name: null,
    visits: 0,
    roundsPlayed: 0,
    totalMatches: 0,
    bestClear: null,
    recent: [],
    dial: { pairShift: 0, lookalike: KAKI_MIN_LOOKALIKE },
    // Which value of roundsPlayed the dial was computed for. null means never.
    dialAt: null,
  };
}

function kakiWhole(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function adoptKakiRecent(saved, fallback) {
  if (!Array.isArray(saved)) return fallback;
  const kept = [];
  saved.forEach(entry => {
    if (entry && typeof entry === 'object') {
      kept.push({ matches: kakiWhole(entry.matches, 0), misses: kakiWhole(entry.misses, 0) });
    }
  });
  return kept.slice(-KAKI_RECENT_KEPT);
}

/* Merge a stored profile onto a fresh blank one. Every field is taken only when
   it survives its own check, so a partial or hand-edited save loses the field it
   is missing instead of poisoning a round with undefined. */
function adoptKakis(saved) {
  const base = blankKakis();
  if (!saved || typeof saved !== 'object') return base;
  if (typeof saved.name === 'string' && saved.name.trim() !== '') {
    base.name = saved.name.trim().slice(0, 20);
  }
  base.visits = kakiWhole(saved.visits, base.visits);
  base.roundsPlayed = kakiWhole(saved.roundsPlayed, base.roundsPlayed);
  base.totalMatches = kakiWhole(saved.totalMatches, base.totalMatches);
  base.bestClear = Number.isFinite(saved.bestClear) && saved.bestClear >= 0
    ? Math.floor(saved.bestClear)
    : base.bestClear;
  base.recent = adoptKakiRecent(saved.recent, base.recent);
  base.dial = clampKakiDial(saved.dial);
  base.dialAt = Number.isFinite(saved.dialAt) ? Math.floor(saved.dialAt) : base.dialAt;
  return base;
}

/* Normalised once per page load, and the same object every call after that.

   Returning a fresh object each time was a real bug: dealKakiRound() holds a
   reference while nextKakiDial() asks for the profile again, so the newly
   computed dial landed on an orphan and state.kakis kept the old one. The dial
   then never walked, because dialAt never advanced with it. Anything that holds
   a profile across a nested call depends on this staying stable. */
let kakiProfileReady = false;

function kakiProfile() {
  if (!kakiProfileReady) {
    state.kakis = adoptKakis(state.kakis);
    kakiProfileReady = true;
  }
  return state.kakis;
}

function persistKakis() {
  saveState();
}

/* ── THE HIDDEN DIAL ────────────────────────────────────────── */

/* Nothing in the UI ever names this. No level number lies about it either: the
   level sets a base pair count and the dial moves the real wall one pair either
   side of it, with the lookalike tiles thinning out or crowding in to match. The
   only visible sign is the size of the table, which reads as a different hand of
   mahjong rather than a verdict on the player.

   It moves one step per finished round. Reopening the island mid-profile must not
   walk it up on its own, so the round it was last computed for is remembered. */

function clampKakiDial(dial) {
  const raw = dial === null || typeof dial !== 'object' ? {} : dial;
  const shift = Number.isFinite(raw.pairShift) ? Math.round(raw.pairShift) : 0;
  const look = Number.isFinite(raw.lookalike) ? raw.lookalike : KAKI_MIN_LOOKALIKE;
  return {
    pairShift: Math.max(-KAKI_MAX_SHIFT, Math.min(KAKI_MAX_SHIFT, shift)),
    lookalike: Math.max(KAKI_MIN_LOOKALIKE, Math.min(KAKI_MAX_LOOKALIKE, look)),
  };
}

/* Eight pairs is four rows of tiles. That fits a 844px phone inside the play
   screen; it does not fit a 667px one, since this screen spends roughly 190px
   on the header and the player bar that the standalone prototype never had. On a
   short phone the wall stops at three rows instead, so the table stays close to
   one flick rather than two. Measured, not guessed: see PORT_MAHJONG_KAKIS.md. */
const KAKI_SHORT_PHONE_PX = 700;
const KAKI_SHORT_MAX_PAIRS = 6;

function kakiMaxPairs() {
  return window.innerHeight < KAKI_SHORT_PHONE_PX ? KAKI_SHORT_MAX_PAIRS : KAKI_MAX_PAIRS;
}

function clampKakiPairs(pairs) {
  const whole = Number.isFinite(pairs) ? Math.round(pairs) : KAKI_MIN_PAIRS;
  return Math.max(KAKI_MIN_PAIRS, Math.min(kakiMaxPairs(), whole));
}

function nextKakiDial() {
  const profile = kakiProfile();
  if (profile.dialAt === profile.roundsPlayed) return clampKakiDial(profile.dial);
  profile.dialAt = profile.roundsPlayed;

  if (profile.recent.length === 0) return { pairShift: 0, lookalike: KAKI_MIN_LOOKALIKE };

  let matches = 0;
  let misses = 0;
  profile.recent.forEach(r => { matches += r.matches; misses += r.misses; });
  const missRate = misses / Math.max(1, matches + misses);

  const dial = clampKakiDial(profile.dial);
  if (missRate < KAKI_FLOWING) {
    return {
      pairShift: Math.min(KAKI_MAX_SHIFT, dial.pairShift + 1),
      lookalike: Math.min(KAKI_MAX_LOOKALIKE, dial.lookalike + KAKI_LOOKALIKE_STEP),
    };
  }
  if (missRate > KAKI_WORKING) {
    return {
      pairShift: Math.max(-KAKI_MAX_SHIFT, dial.pairShift - 1),
      lookalike: Math.max(KAKI_MIN_LOOKALIKE, dial.lookalike - KAKI_LOOKALIKE_STEP),
    };
  }
  return dial;
}

/* ── WHAT A KAKI REMEMBERS ──────────────────────────────────── */

/* History slots for return_visit. Both are optional: a missing one is left out
   of the context entirely and kakiFillSlots closes the gap, so every template
   still reads as a sentence. The values are warm phrases, never statistics, and
   never a count of what the player got wrong. */

function kakiRoundsPhrase(played) {
  if (played >= 4) return 'many rounds';
  if (played >= 2) return 'a few rounds';
  if (played === 1) return 'one round';
  return null;
}

/* bestClear is the fewest mismatches in any finished round. Every branch reads
   as praise for what happened, never as a count of what did not. */
function kakiBestPhrase(bestClear) {
  if (!Number.isFinite(bestClear)) return null;
  if (bestClear === 0) return 'how you cleared it first try';
  if (bestClear <= 2) return 'how fast you found the pairs';
  return 'how you stayed until the end';
}

function returnKakiContext() {
  const profile = kakiProfile();
  const context = {
    name: profile.name,
    /* This event fires once per page load, so an unseeded pick would land on the
       same line forever. Seeding from the name and the visit number spreads a
       player across the whole set and keeps two people apart. */
    seed: hashString(`${profile.name}|visit|${profile.visits}`),
  };
  const rounds = kakiRoundsPhrase(profile.roundsPlayed);
  if (rounds) context.rounds = rounds;
  const best = kakiBestPhrase(profile.bestClear);
  if (best) context.best = best;
  return context;
}

function firstKakiContext() {
  const profile = kakiProfile();
  return { name: profile.name, seed: hashString(`${profile.name}|first|${profile.visits}`) };
}

/* ── A ROUND AT THE TABLE ───────────────────────────────────── */

let kakiRound = null;
let kakiBasePairs = KAKI_MIN_PAIRS;
/* Which hello the next deal owes the player, cleared once it is paid.
   "first_visit"  nobody has finished a round here yet, so the opening line
                  welcomes and teaches instead of claiming a shared past.
   "return_visit" somebody who has finished a round opened the island again.
   null           an ordinary deal later in the same sitting. */
let kakiPendingGreeting = null;
/* One visit per page load, counted the first time the player sits down. */
let kakiVisitCounted = false;
/* Bumped on every deal, so a timer left over from an abandoned round can tell
   that it no longer owns the table. */
let kakiRoundToken = 0;
/* The tallest the bubble slot has been since the current wall was dealt. */
let kakiSlotFloor = 0;

function initKakis(level) {
  kakiBasePairs = clampKakiPairs(level ? level.pairs : KAKI_MIN_PAIRS);
  // Any wall left over from a round the player walked out of is not this round.
  kakiRound = null;
  const profile = kakiProfile();

  /* The garden boots without ever touching this island, so the visit is counted
     here, the first time the player sits down in this page load. */
  if (!kakiVisitCounted) {
    kakiVisitCounted = true;
    profile.visits += 1;
    /* A name on its own is not a shared history. Somebody who never finished a
       round is still being welcomed for the first time. */
    kakiPendingGreeting = profile.roundsPlayed >= 1 ? 'return_visit' : 'first_visit';
    // Seat one behind the visit count so a first visit lands on the front chair.
    kakiSeat(profile.visits - 1);
    persistKakis();
  }

  buildKakiScreen();

  if (!profile.name) {
    showKakiNameChooser('');
    return;
  }
  startKakiTable();
}

function buildKakiScreen() {
  const playArea = document.getElementById('play-area');
  const playFooter = document.getElementById('play-footer');

  playArea.innerHTML = `
    <div class="kaki-name-panel" id="kaki-name-panel" hidden>
      <div class="kaki-question">What should the kakis call you?</div>
      <div class="kaki-chips">
        ${KAKI_NAME_CHIPS.map(n => `<button class="kaki-chip" type="button" data-kaki-name="${n}">${n}</button>`).join('')}
      </div>
      <label class="kaki-label" for="kaki-name-input">Or type your own name</label>
      <input class="kaki-input" id="kaki-name-input" type="text" autocomplete="off" maxlength="20" spellcheck="false">
      <button class="btn btn-primary btn-lg" id="kaki-name-confirm">Start with this name</button>
    </div>

    <div class="kaki-table" id="kaki-table" hidden>
      <div class="kaki-row">
        ${KAKIS.map(k => `
          <div class="kaki" data-kaki-slot="${k.id}">
            <span class="kaki-portrait" aria-hidden="true">${k.portrait()}</span>
            <span class="kaki-who"><span class="kaki-sr">${k.honorific}</span>${k.shortName}</span>
          </div>`).join('')}
      </div>
      <div class="kaki-bubble-slot" id="kaki-bubble-slot">
        <button class="kaki-bubble" type="button" id="kaki-bubble" role="status" aria-live="polite" disabled>
          <span class="kaki-bubble-name" id="kaki-bubble-name"></span>
          <span class="kaki-bubble-text" id="kaki-bubble-text"></span>
        </button>
      </div>
      <div class="kaki-grid" id="kaki-grid" tabindex="-1" aria-label="Tiles on the table"></div>
    </div>
  `;

  playFooter.innerHTML = `
    <div class="kaki-bar" id="kaki-bar" hidden>
      <button class="kaki-player-name" type="button" id="kaki-rename" aria-label="Change what the kakis call you"></button>
      <span class="kaki-dots" id="kaki-dots" aria-hidden="true"></span>
      <span class="kaki-progress" id="kaki-progress"></span>
    </div>
  `;

  document.getElementById('kaki-grid').addEventListener('click', (e) => {
    const tile = e.target.closest('.kaki-tile');
    if (tile) onKakiTileTap(Number(tile.dataset.index));
  });

  document.getElementById('kaki-bubble').addEventListener('click', kakiDismiss);

  playArea.querySelectorAll('[data-kaki-name]').forEach(chip => {
    chip.addEventListener('click', () => chooseKakiName(chip.dataset.kakiName));
  });

  const input = document.getElementById('kaki-name-input');
  document.getElementById('kaki-name-confirm').addEventListener('click', () => chooseKakiName(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); chooseKakiName(input.value); }
  });

  document.getElementById('kaki-rename').addEventListener('click', () => {
    showKakiNameChooser(kakiProfile().name || '');
  });
}

/* The name panel and the table are siblings that both stay in the DOM. Renaming
   mid-round hides the table rather than rebuilding it, so the wall on the table
   is exactly where the player left it when they come back. */
function showKakiNameChooser(current) {
  document.getElementById('kaki-name-panel').hidden = false;
  document.getElementById('kaki-table').hidden = true;
  document.getElementById('kaki-bar').hidden = true;
  kakiDismiss();
  const input = document.getElementById('kaki-name-input');
  input.value = typeof current === 'string' ? current : '';
}

function startKakiTable() {
  document.getElementById('kaki-name-panel').hidden = true;
  document.getElementById('kaki-table').hidden = false;
  document.getElementById('kaki-bar').hidden = false;
  dealKakiRound();
}

/* An empty box is not a name. Nothing is stored, nothing starts, and the caret
   goes back where the player can type: no error text, nothing to feel caught out
   by. */
function chooseKakiName(raw) {
  const input = document.getElementById('kaki-name-input');
  const name = String(raw === undefined || raw === null ? '' : raw).trim().slice(0, 20);
  if (name === '') {
    if (input) input.focus();
    return;
  }

  const profile = kakiProfile();
  const renaming = Boolean(profile.name);
  profile.name = name;
  persistKakis();

  /* A rename touches the name and nothing else. Visits, rounds, best clear and
     the dial all belong to the same player, who has only changed what they are
     called, and the round in progress is not thrown away for it. */
  if (renaming && kakiRound) {
    document.getElementById('kaki-name-panel').hidden = true;
    document.getElementById('kaki-table').hidden = false;
    document.getElementById('kaki-bar').hidden = false;
    updateKakiBar();
    return;
  }
  startKakiTable();
}

function dealKakiRound() {
  const profile = kakiProfile();
  kakiRoundToken += 1;
  resetKakiSlotFloor();

  const dial = nextKakiDial();
  profile.dial = dial;
  persistKakis();

  const pairs = clampKakiPairs(kakiBasePairs + dial.pairShift);
  const wall = buildKakiWall({
    tileCount: pairs * 2,
    lookalike: dial.lookalike,
    seed: hashString(`${profile.name}:${profile.roundsPlayed}:${kakiBasePairs}`),
  });

  kakiRound = {
    tiles: wall.map(t => ({ id: t.id, label: t.label, svg: t.svg, state: 'idle' })),
    selected: null,
    resolving: false,
    matches: 0,
    misses: 0,
    taps: 0,
    nudges: 0,
  };
  // completeExercise() reads this for the perfect-run stat and the s_perfect task.
  playState.mistakes = 0;

  /* Fourteen and sixteen tiles are the two walls that need the whole phone. The
     stylesheet closes the table up around them and leaves every smaller deal
     alone, so it has to know which one is down. */
  document.getElementById('kaki-table').dataset.wall =
    kakiRound.tiles.length >= KAKI_BIG_WALL ? 'big' : 'normal';

  renderKakiTiles();
  renderKakiDots();
  updateKakiBar();

  if (kakiPendingGreeting === 'return_visit') {
    kakiPendingGreeting = null;
    kakiSpeak('return_visit', returnKakiContext());
    return;
  }
  if (kakiPendingGreeting === 'first_visit') {
    kakiPendingGreeting = null;
    kakiSpeak('first_visit', firstKakiContext());
    return;
  }
  kakiSpeak('round_start', { name: profile.name });
}

function renderKakiTiles() {
  const grid = document.getElementById('kaki-grid');
  const nodes = kakiRound.tiles.map((tile, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kaki-tile';
    button.dataset.tile = tile.id;
    button.dataset.state = 'idle';
    button.dataset.index = String(index);
    button.setAttribute('aria-label', tile.label);
    button.style.setProperty('--kaki-i', String(index));
    button.innerHTML = tile.svg;
    return button;
  });
  grid.replaceChildren(...nodes);
}

/* One dot per pair, drawn once a deal and only ever filled in after that, so the
   dot that has just been won is the only one that pops. */
function renderKakiDots() {
  const dots = document.getElementById('kaki-dots');
  const pairs = kakiRound.tiles.length / 2;
  const nodes = [];
  for (let i = 0; i < pairs; i++) {
    const dot = document.createElement('span');
    dot.className = 'kaki-dot';
    nodes.push(dot);
  }
  // The stylesheet needs the count to decide whether the row still fits beside
  // the player's name on a narrow phone.
  dots.dataset.count = String(pairs);
  dots.replaceChildren(...nodes);
}

function kakiNodeAt(index) {
  return document.getElementById('kaki-grid').children[index];
}

function setKakiTileState(index, value) {
  kakiRound.tiles[index].state = value;
  const node = kakiNodeAt(index);
  if (node) node.dataset.state = value;
}

function onKakiTileTap(index) {
  if (kakiRound === null || kakiRound.resolving) return;
  const tile = kakiRound.tiles[index];
  if (!tile || tile.state === 'cleared') return;

  kakiRound.taps += 1;

  if (kakiRound.selected === index) {
    setKakiTileState(index, 'idle');
    kakiRound.selected = null;
    maybeKakiNudge();
    return;
  }

  if (kakiRound.selected === null) {
    setKakiTileState(index, 'selected');
    kakiRound.selected = index;
    playSelect();
    maybeKakiNudge();
    return;
  }

  const first = kakiRound.selected;
  setKakiTileState(index, 'selected');
  kakiRound.selected = null;

  if (kakiRound.tiles[first].id === tile.id) {
    resolveKakiMatch(first, index);
    return;
  }
  resolveKakiMiss(first, index);
}

function resolveKakiMatch(a, b) {
  const profile = kakiProfile();
  kakiRound.resolving = true;
  kakiRound.matches += 1;
  kakiRound.taps = 0;
  kakiRound.nudges = 0;
  profile.totalMatches += 1;
  playCoin();

  const last = kakiRound.matches * 2 >= kakiRound.tiles.length;
  if (!last) kakiSpeak('match_found', { name: profile.name });

  const token = kakiRoundToken;
  kakiNodeAt(a).classList.add('is-clearing');
  kakiNodeAt(b).classList.add('is-clearing');

  window.setTimeout(() => {
    if (token !== kakiRoundToken) return;
    [a, b].forEach(index => {
      const node = kakiNodeAt(index);
      if (node) {
        node.classList.remove('is-clearing');
        node.disabled = true;
      }
      setKakiTileState(index, 'cleared');
    });
    kakiRound.resolving = false;
    updateKakiBar();
    if (last) finishKakiRound();
  }, KAKI_CLEAR_MS);
}

function resolveKakiMiss(a, b) {
  kakiRound.resolving = true;
  kakiRound.misses += 1;
  playState.mistakes = kakiRound.misses;
  playWrong();

  const token = kakiRoundToken;
  kakiNodeAt(a).classList.add('is-wiggle');
  kakiNodeAt(b).classList.add('is-wiggle');
  kakiSpeak('near_miss', { name: kakiProfile().name });

  window.setTimeout(() => {
    if (token !== kakiRoundToken) return;
    [a, b].forEach(index => {
      const node = kakiNodeAt(index);
      if (node) node.classList.remove('is-wiggle');
      setKakiTileState(index, 'idle');
    });
    kakiRound.resolving = false;
  }, KAKI_MISS_HOLD_MS);
}

/* Taps since the last match, never a clock. Nothing here is a timer. */
function maybeKakiNudge() {
  if (kakiRound.taps < KAKI_NUDGE_TAPS) return;
  kakiRound.taps = 0;
  kakiRound.nudges += 1;
  kakiSpeak('idle_nudge', { name: kakiProfile().name });

  if (kakiRound.nudges >= KAKI_GLOW_AFTER_NUDGES) {
    kakiRound.nudges = 0;
    breatheKakiPair();
  }
}

/* Light one real pair for a moment. Silent on purpose: the kaki is already
   talking, and nothing anywhere calls this help. */
function breatheKakiPair() {
  const seen = new Map();
  for (let i = 0; i < kakiRound.tiles.length; i++) {
    const tile = kakiRound.tiles[i];
    if (tile.state === 'cleared') continue;
    const twin = seen.get(tile.id);
    if (twin !== undefined) {
      breatheKakiTile(twin);
      breatheKakiTile(i);
      return;
    }
    seen.set(tile.id, i);
  }
}

function breatheKakiTile(index) {
  const node = kakiNodeAt(index);
  if (!node) return;
  const token = kakiRoundToken;
  node.classList.add('is-glow');
  window.setTimeout(() => {
    if (token !== kakiRoundToken) return;
    node.classList.remove('is-glow');
  }, KAKI_GLOW_MS);
}

function finishKakiRound() {
  const profile = kakiProfile();
  profile.roundsPlayed += 1;
  profile.recent = profile.recent
    .concat([{ matches: kakiRound.matches, misses: kakiRound.misses }])
    .slice(-KAKI_RECENT_KEPT);
  if (profile.bestClear === null || kakiRound.misses < profile.bestClear) {
    profile.bestClear = kakiRound.misses;
  }
  playState.mistakes = kakiRound.misses;
  persistKakis();
  bumpStat('kakiRounds');

  kakiSpeak('round_win', { name: profile.name });

  /* Let the win line land and be read before the completion card takes the
     screen, because completeExercise() rebuilds #play-area, which is where the bubble
     lives. If the player walked out during the hold, the token has moved on and
     this does nothing. */
  const token = kakiRoundToken;
  window.setTimeout(() => {
    if (token !== kakiRoundToken || currentScreenName !== 'play' || currentExercise !== 'kakis') return;
    kakiRound = null;
    completeExercise(6, 'kakis');
  }, KAKI_WIN_HOLD_MS);
}

function updateKakiBar() {
  const profile = kakiProfile();
  const nameEl = document.getElementById('kaki-rename');
  const progress = document.getElementById('kaki-progress');
  const dots = document.getElementById('kaki-dots');
  if (nameEl) {
    nameEl.textContent = profile.name || '';
    // The label carries the name too, or a screen reader hears only the verb and
    // never learns what the kakis are actually calling this player.
    nameEl.setAttribute('aria-label', `The kakis call you ${profile.name || 'nothing yet'}. Change this name.`);
  }
  if (!kakiRound) return;
  if (progress) progress.textContent = `${kakiRound.matches} of ${kakiRound.tiles.length / 2} pairs`;
  if (dots) {
    for (let i = 0; i < dots.children.length; i++) {
      dots.children[i].classList.toggle('is-found', i < kakiRound.matches);
    }
  }
}

/* Hold the floor under the bubble slot so the table below can only ever be
   pushed down by something the player did, never pulled up mid-round. */
function latchKakiSlotFloor() {
  const slot = document.getElementById('kaki-bubble-slot');
  if (!slot) return;
  const height = slot.getBoundingClientRect().height;
  if (height > kakiSlotFloor) {
    kakiSlotFloor = height;
    slot.style.setProperty('--kaki-slot-floor', `${Math.ceil(height)}px`);
  }
}

function resetKakiSlotFloor() {
  kakiSlotFloor = 0;
  const slot = document.getElementById('kaki-bubble-slot');
  if (slot) slot.style.removeProperty('--kaki-slot-floor');
}

/* ── INITIALISE ─────────────────────────────────────────────── */

function init() {
  // Pre-plant one pandan seed for brand-new players
  if (state.plants.length === 0 && state.totalExercises === 0 && !state.lastVisit) {
    plantSeed('pandan');
  }

  updateStreak();
  applyComebackGrace();   // must precede updatePlantStates()
  updatePlantStates();
  checkMealUnlocks();
  rollDailyTasks();
  updateCoinDisplay();
  renderGarden2();

  // init() renders the garden directly rather than routing through
  // showScreen(), so credit the visit here or g_visit can never complete.
  progressTask('g_visit');

  // Quiet discovery: dawn / dusk visits (count once per day)
  const hour = new Date().getHours();
  if (state.lastVisit !== todayStr()) {
    if (hour < 7) bumpStat('dawnVisits');
    if (hour >= 21) bumpStat('duskVisits');
  }

  // Comeback card after 3+ days away. This is the ONLY return message on a
  // comeback day — the thirsty-plant warning below is suppressed so the return
  // reads as welcome rather than as a list of things gone wrong.
  if (state.absence.comebackToday) {
    const thirsty = state.plants.filter(p => p.state === 'wilt').length;
    const body = thirsty > 0
      ? `Your garden waited for you. ${thirsty} plant${thirsty > 1 ? 's' : ''} could use a drink — the rest kept going just fine. Today's tasks are gentle ones.`
      : `Your garden waited for you. Everything is doing well. Today's tasks are gentle ones.`;
    setTimeout(() => {
      showNotif('info', 'comeback', 'Welcome back', body, 'icon-sun');
    }, 900);
  }

  // Pending achievement awards from previous session
  setTimeout(() => drainAwards(), 1600);

  // Set initial mute state
  syncSoundControl();

  // First-visit welcome
  if (!state.lastVisit) {
    setTimeout(() => {
      showNotif('info', 'welcome', 'Welcome to your garden', 'Do brain exercises to earn coins, then buy seeds to grow your garden.', 'icon-garden');
    }, 800);
  } else if (isNewDay(state.lastVisit)) {
    const wiltCount = state.plants.filter(p => p.state === 'wilt').length;
    if (wiltCount > 0 && !state.absence.comebackToday) {
      setTimeout(() => {
        showNotif('warn', 'wilt-return', 'Your plants missed you', `${wiltCount} plant${wiltCount > 1 ? 's are' : ' is'} thirsty. A little water and they'll be happy again.`, 'icon-water');
      }, 600);
    } else if (state.plants.length > 0 && !state.absence.comebackToday) {
      setTimeout(() => {
        showNotif('info', 'welcome-back', 'Welcome back!', 'Your garden is looking lovely today.', 'icon-sun');
      }, 600);
    }
  }

  state.absence.comebackToday = false; // consumed after today's roll + card
  state.lastVisit = todayStr();
  saveState();
}

init();

/* ── SERVICE WORKER — offline support ───────────────────────── */

/* Registered after load so it never competes with first paint. Requires a
   secure context: https:// or localhost. Over plain http on a LAN IP the
   registration is skipped by the browser and the game still runs online. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // A new version is waiting: activate it, then reload once so the
      // player never gets stuck on a stale build between deploys.
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            sw.postMessage('SKIP_WAITING');
          }
        });
      });
    }).catch(() => { /* offline support unavailable — game still works */ });

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

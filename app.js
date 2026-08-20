/* ============================================================================
   Match-3 Roguelite — PERSISTENT BOARD variant (fork of react-roguelite).
   One board for the whole run, one run-long progress bar with cumulative
   score checkpoints. Crossing a checkpoint grants moves + a power-up draft.
   After the final checkpoint, growing endless rounds rotate one equipped
   power-up at a time. No discrete levels, no board regeneration.

   All balance knobs live in CONFIG below. Power-ups are self-contained
   objects in POWERUPS that hook into game events (mods fold, onMatch,
   onRunStart) so new ones can be added without touching the engine.
   ========================================================================== */
'use strict';

const CONFIG = {
  // Stamped into every telemetry record so balance passes only compare runs
  // played on the same rules. Bump when mechanics or targets change.
  // Forked from base-game v14; this variant versions independently.
  BALANCE_VERSION: 4, // v4: 50-100% opening ramp + growing endless power-up rotations
  VARIANT: 'ofir',                 // stamped into telemetry so datasets never mix

  // Remote telemetry sink — SHARED with the base game (same Supabase table;
  // records separate by payload->>variant). Publishable key — safe to ship.
  // Empty either string to disable sending (localStorage copy always kept).
  TELEMETRY_ENDPOINT: '',
  TELEMETRY_KEY: '',

  // Run structure — cumulative score checkpoints along one run-long bar.
  // v3 retune from telemetry (72 segments, 6 testers): v2 cleared segs 2-4 & 6
  // at 100% — surplus moves carry over on a persistent board (they vanished at
  // level end in the base game), so grants now track observed per-segment need
  // (med. 9-16 moves used) and the middle checkpoints rose ~10%.
  CHECKPOINTS: [80, 250, 520, 900, 1500, 2500],
  CHECKPOINT_DIFFICULTY: [0.5, 0.6, 0.7, 0.8, 0.9, 1],
  ENDLESS_SCORE_GROWTH: 1.25,
  START_MOVES: 10,                 // opening move pool (base L1 budget)
  // Moves granted on crossing checkpoint i; the last entry is the victory-lap
  // grant past the final flag (halved in v3 — the endless economy self-extends:
  // refunds/momentum/chests stretched 16 grant moves into 40-60-move laps).
  CHECKPOINT_MOVES: [10, 12, 13, 14, 15, 8],
  DRAFT_OPTIONS: 3,                // 2 or 3 — also toggleable in the UI

  // Per-move drip spawns — replaces the base game's per-level seeding of
  // special cells/chests. After every move, each owned type rolls once
  // (seeded RNG); caps bound how many exist at once, pity timers guarantee
  // a spawn after too many dry moves. Rates ≈ base-game per-level density.
  // (Xtra-move marks don't drip: exactly 1 mark per pick lives on the board
  // at all times — consuming one respawns another the same move.)
  DRIP: {
    pinata: { chance: 0.15, pity: 12, cap: 2 },
    chest:  { chance: 0.15, pity: 12, cap: 2 },  // counts board + queued
    triple: { chance: 0.08, pity: 20, cap: 1 },
  },

  // Board
  BOARD_COLS: 7,
  BOARD_ROWS: 7,
  COLOURS: 5,
  MAX_BOARD: 10,                   // hard cap for the Expand power-up

  // Target scaling per colour count (applies to every checkpoint value).
  // Bot A/B (12 seeds, 12 moves, no picks): 6-colour pace ≈ 0.86× of 5-colour.
  COLOUR_TARGET_SCALE: { 5: 1, 6: 0.85 },

  // Draft gating by draft NUMBER (1 = the run-start draft, then +1 per
  // checkpoint crossed) — same cadence as the base game's per-level gates.
  STRONG_POWERUPS_FROM_LEVEL: 3,
  LEGENDARY_FROM_LEVEL: 5,
  LEGENDARY_WEIGHT: 0.5,           // draft-weight multiplier for tier-3 offers

  MERGE_BONUS_MOVES: 1,            // fusion energy: moves granted per special merge
  MOMENTUM_BASE: 5,                // 4+ matches needed to fill the momentum bar
  MOMENTUM_MIN: 2,                 // bar floor no matter how many stacks

  // Special piece spawn thresholds
  MATCH_4_SPAWNS: 'arrow',
  MATCH_5_SPAWNS: 'lightning',
  MATCH_SHAPE_SPAWNS: 'bomb',     // L or T shape

  // Power-up tuning
  BOMB_CHANCE_PER_PICK: 0.05,      // 5% per pick, cumulative
  SPECIAL_SPAWNER_CHANCE: 0.40,    // 40% chance on boosted-colour match, per pick
  FILL_UP_THRESHOLD: 40,           // boosted tiles matched per multiplier step
  LIFESAVER_BONUS_MOVES: 3,
  SNOWBALL_MOVES_PER_POINT: 2,     // snowball bonus grows +1 per this many moves
  COUNTDOWN_TIMER_START: 3,
  BLAST_RADIUS_BONUS: 1,           // extra rings added to bomb explosion, per pick
  MAX_BOMB_RADIUS: 3,
  SQUARE_BONUS_POINTS: 10,         // square bonus upgrade: flat points per square match
  CHOMPER_WRAP: true,  // edges wrap Pac-Man style; false = stay in place at edges
  SPAWN_WEIGHT_PER_PICK: 0.5,      // extra refill weight on boosted colours, per pick (base weight 1)
  TEMPO_MULT: 3,                   // score multiplier on the first match after each checkpoint
  CHEST_POINTS: 30,                // chest reward when moves aren't scarce
  CHEST_MOVES: 2,                  // chest reward when running low on moves
  CHEST_LOW_MOVES: 4,              // "low" = this many moves left or fewer
  PINATA_HITS: 5,                  // clears over a piñata cell to crack it
  PINATA_POINTS: 50,               // payout per cracked piñata
  TRIPLE_TILE_MULT: 3,             // whole-move multiplier when triggered

  // Draft weighting
  SYNERGY_CLUSTER_WEIGHT: 0.6,     // weight += this per already-picked power-up in the same cluster
  BOOST_SAME_COLOUR_CHANCE: 0.6,   // chance a new Colour boost offer re-rolls an existing colour

  // Safety / pacing
  AUTO_EXPLODE_MAX_ROUNDS: 1,      // auto-explode resolves in a single round per move:
                                   // specials spawned during that resolution wait for the next move
  MAX_CASCADES: 30,

  // Animation timings (ms)
  SWAP_MS: 150, POP_MS: 220, FALL_MS: 240, STEP_PAUSE: 40,
  FALL_MAX_MS: 400,      // cap for distance-scaled fall duration
  // Juice: staggered clear waves make cause-and-effect readable
  BOOM_STAGGER_MS: 35,   // per ring of distance from an explosion centre
  LINE_STAGGER_MS: 22,   // per cell along a row/column clear
  CHAIN_STAGGER_MS: 90,  // per chain-depth of triggered specials
  COMBO_CALLOUT_FROM: 2, // show "Combo ×N" from this cascade depth
};

const COLOR_NAMES = ['Red', 'Amber', 'Green', 'Blue', 'Purple', 'Orange'];
const SPECIAL_EMOJI = { bomb: '💣', arrow: '➡️', lightning: '⚡', dynamite: '🧨', cross: '✚' };
// Matryoshka decay chain: an exploding special leaves the next weaker one behind.
const MATRYOSHKA_NEXT = { lightning: 'bomb', cross: 'bomb', bomb: 'arrow', arrow: 'dynamite', dynamite: null };
const DIRS4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/* ----------------------------- Seeded RNG -------------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const K = (r, c) => r + ',' + c;

/* --------------------------- Play telemetry ------------------------------
   Every checkpoint SEGMENT (the stretch between two checkpoints) is logged
   to localStorage so difficulty can be tuned from real play. Records carry
   variant:'persistent' and their own key so base-game datasets never mix.
   Scripted/bot runs carry fast:true and are excluded from human summaries. */
const TELEMETRY_KEY = 'rl_ofir_telemetry_v1';
const TELEMETRY_MAX_RECORDS = 500;
function telemetryAll() {
  try { return JSON.parse(localStorage.getItem(TELEMETRY_KEY)) || []; } catch (e) { return []; }
}
function telemetrySave(rec) {
  try {
    const all = telemetryAll();
    all.push(rec);
    while (all.length > TELEMETRY_MAX_RECORDS) all.shift();
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(all));
  } catch (e) { /* storage unavailable — prototype keeps playing */ }
  if (!rec.fast) telemetrySend(rec); // bot/test runs stay local-only
}
function telemetryClear() {
  try { localStorage.removeItem(TELEMETRY_KEY); } catch (e) {}
}
// Anonymous per-browser id so remote records group by tester without any PII.
// Same localStorage key as the base game on purpose: one tester, one id,
// across both variants.
function telemetryClientId() {
  try {
    let id = localStorage.getItem('rl_client_id');
    if (!id) {
      id = 'c' + Math.random().toString(36).slice(2, 10); // cosmetic randomness — not the game RNG
      localStorage.setItem('rl_client_id', id);
    }
    return id;
  } catch (e) { return 'c-unknown'; }
}
// Fire-and-forget remote send; disabled while CONFIG endpoints are empty.
// Never throws, never blocks gameplay, never replaces the localStorage copy.
function telemetrySend(rec) {
  if (!CONFIG.TELEMETRY_ENDPOINT || !CONFIG.TELEMETRY_KEY) return;
  try {
    fetch(CONFIG.TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CONFIG.TELEMETRY_KEY,
        Authorization: 'Bearer ' + CONFIG.TELEMETRY_KEY,
      },
      body: JSON.stringify({ client: telemetryClientId(), payload: rec }),
    }).catch(() => {});
  } catch (e) { /* blocked environment (e.g. artifact CSP) — local copy remains */ }
}
function telemetrySummary(includeBot = false, version = null) {
  const recs = telemetryAll().filter(r => (includeBot || !r.fast) && (version === null || r.v === version));
  const byLevel = {};
  for (const r of recs) {
    const b = byLevel[r.level] || (byLevel[r.level] = { level: r.level, plays: 0, clears: 0, ppm: 0, score: 0, target: 0 });
    b.plays++; if (r.result === 'clear') b.clears++;
    b.ppm += r.ppm; b.score += r.score; b.target += r.target;
  }
  return Object.values(byLevel).sort((a, b) => a.level - b.level).map(b => ({
    level: b.level, plays: b.plays,
    clearRate: +(b.clears / b.plays).toFixed(2),
    avgPtsPerMove: +(b.ppm / b.plays).toFixed(1),
    avgScore: Math.round(b.score / b.plays),
    target: Math.round(b.target / b.plays), // segment delta, from the records themselves
  }));
}

/* ============================== POWER-UPS =================================
   Each power-up is self-contained:
     mods(m, pick, game)          — fold static modifiers into game.mods
                                    (recomputed on every pick)
     onMatch(game, pick, group, api) — react to a match group this step
     onRunStart(game, pick)       — one-time board setup; fires at run start,
                                    or immediately when picked mid-run
     roll(game)                   — extra data rolled when offered (e.g. colour)
     desc(pick)                   — one-line card text
   Cumulative picks work by folding mods per pick, or by onMatch firing once
   per pick. `stackable:false` removes it from the pool once picked.
   Marked cells / chests are no longer seeded per level: they DRIP in with a
   per-move spawn chance (CONFIG.DRIP) once their power-up is owned.
   ========================================================================== */
const POWERUPS = {
  boost: {
    id: 'boost', name: 'Colour boost', icon: '🎨', cluster: 'colour', stackable: true,
    roll(g) {
      const owned = Object.keys(g.mods.boosts).map(Number);
      if (owned.length && g.rng() < CONFIG.BOOST_SAME_COLOUR_CHANCE)
        return { color: owned[Math.floor(g.rng() * owned.length)] };
      return { color: Math.floor(g.rng() * g.opts.colours) };
    },
    desc: p => `${COLOR_NAMES[p.color]} tiles score +1 point each (stacks)`,
    mods(m, p) { m.boosts[p.color] = (m.boosts[p.color] || 0) + 1; },
  },
  flood: {
    id: 'flood', name: 'Flood', icon: '🌊', cluster: 'colour', stackable: true, requiresBoost: true,
    disabled: true, // pulled from the draft pool for now (2026-08-13) — effect code kept for re-enable
    desc: () => 'Matching a boosted colour converts 1 adjacent tile to that colour',
    onMatch(g, p, group, api) { if (g.mods.boosts[group.color]) api.flood(group, group.color); },
  },
  spawner: {
    id: 'spawner', name: 'Special spawner', icon: '✨', cluster: 'colour', stackable: true, requiresBoost: true,
    desc: () => `Boosted-colour matches: ${Math.round(CONFIG.SPECIAL_SPAWNER_CHANCE * 100)}% chance to spawn a special piece`,
    onMatch(g, p, group, api) {
      if (g.mods.boosts[group.color] && g.rng() < CONFIG.SPECIAL_SPAWNER_CHANCE) api.spawnRandomSpecial(group);
    },
  },
  fillup: {
    id: 'fillup', name: 'Fill-up', icon: '🔋', cluster: 'colour', stackable: false, requiresBoost: true,
    desc: () => `Every ${CONFIG.FILL_UP_THRESHOLD} boosted tiles matched: run multiplier +1`,
    mods(m) { m.fillup = true; }, // drives the battery meter in the level UI
    onMatch(g, p, group) {
      if (!g.mods.boosts[group.color]) return;
      g.run.fillCount += group.cells.length;
      while (g.run.fillCount >= CONFIG.FILL_UP_THRESHOLD * (g.run.fillTriggers + 1)) {
        g.run.fillTriggers++; g.run.multiplier++;
        g.callout(`🔋 Multiplier ×${g.run.multiplier}!`);
      }
    },
  },
  sweep: {
    id: 'sweep', name: 'Vertical sweep', icon: '🧹', cluster: 'colour', stackable: false,
    desc: () => 'Vertical matches you make also clear every tile of that colour',
    // group.active = the match contains a cell the player just swapped.
    // Cascade/auto-explode matches must NOT sweep, or chains snowball into
    // whole levels clearing themselves off a single move.
    onMatch(g, p, group, api) {
      if (group.active && group.runs.some(r => r.dir === 'v')) api.clearColor(group.color, group);
    },
  },
  bombchance: {
    id: 'bombchance', name: 'Bomb chance', icon: '🎲', cluster: 'chaos', stackable: true,
    desc: () => `+${Math.round(CONFIG.BOMB_CHANCE_PER_PICK * 100)}% chance each refill tile spawns as a bomb (stacks)`,
    mods(m) { m.bombChance += CONFIG.BOMB_CHANCE_PER_PICK; },
  },
  autoexplode: {
    id: 'autoexplode', name: 'Auto-explode', icon: '🔥', cluster: 'chaos', stackable: false,
    desc: () => 'Every special on the board explodes at the end of each move',
    mods(m) { m.autoExplode = true; },
  },
  countdown: {
    id: 'countdown', name: 'Countdown', icon: '⏲️', cluster: 'chaos', stackable: false,
    desc: () => `Specials get a ${CONFIG.COUNTDOWN_TIMER_START}-move fuse, then explode on their own`,
    mods(m) { m.countdown = true; },
  },
  blast: {
    id: 'blast', name: 'Blast radius', icon: '💥', cluster: 'chaos', stackable: true,
    desc: () => 'Bomb explosions are one ring bigger (stacks)',
    mods(m) { m.blastBonus += CONFIG.BLAST_RADIUS_BONUS; },
  },
  specialscore: {
    id: 'specialscore', name: 'Special score', icon: '💎', cluster: 'chaos', stackable: true,
    desc: () => 'Special pieces score +1 point when they explode (stacks)',
    mods(m) { m.specialScore += 1; },
  },
  // Like sweep, both line-clears are active-only: cascade matches triggering
  // them causes runaway chains (telemetry showed 120 pts/move at L4).
  rowclear: {
    id: 'rowclear', name: 'Row clear', icon: '✂️', cluster: 'chaos', stackable: false,
    desc: () => 'Horizontal matches you make clear the whole row',
    onMatch(g, p, group, api) { if (group.active) api.clearLines(group, 'h'); },
  },
  colclear: {
    id: 'colclear', name: 'Column clear', icon: '🪓', cluster: 'chaos', stackable: false,
    desc: () => 'Vertical matches you make clear the whole column',
    onMatch(g, p, group, api) { if (group.active) api.clearLines(group, 'v'); },
  },
  // Expand was one power-up (+1 row AND +1 col per pick) — that made stacked
  // picks near-unlosable, so it's split per axis. Still cumulative; each pick
  // now grows one dimension instead of two (MAX_BOARD caps the total).
  expandrow: {
    id: 'expandrow', name: 'Expand rows', icon: '📏', cluster: 'utility', stackable: true,
    desc: () => 'Board grows by one row, immediately (stacks)',
    mods(m) { m.expandRows += 1; },
  },
  expandcol: {
    id: 'expandcol', name: 'Expand columns', icon: '📐', cluster: 'utility', stackable: true,
    desc: () => 'Board grows by one column, immediately (stacks)',
    mods(m) { m.expandCols += 1; },
  },
  xtramove: {
    id: 'xtramove', name: 'Xtra move tiles', icon: '🔄', cluster: 'utility', stackable: true,
    desc: () => 'One 🔄 cell is always on the board; matching over it refunds the move, and a new one pops up elsewhere (stacks: +1 cell each, max 1 refund per move)',
    mods(m) { m.marks += 1; }, // m.marks = how many marks live on the board at once
  },
  square: {
    id: 'square', name: 'Square match', icon: '🀄', cluster: 'utility', stackable: false,
    desc: () => '2×2 matches count, and spawn a dynamite that blasts a + shape',
    mods(m) { m.square = true; },
  },
  squarebomb: {
    id: 'squarebomb', name: 'Square bomb', icon: '💣', cluster: 'utility', stackable: false, requiresSquare: true,
    desc: () => 'Square matches spawn a bomb instead of a dynamite',
    mods(m) { m.squareBomb = true; },
  },
  squarescore: {
    id: 'squarescore', name: 'Square bonus', icon: '🔷', cluster: 'utility', stackable: false, requiresSquare: true,
    desc: () => `Square matches score +${CONFIG.SQUARE_BONUS_POINTS} points`,
    onMatch(g, p, group, api) { if (group.square) api.addBonus(CONFIG.SQUARE_BONUS_POINTS); },
  },
  lifesaver: {
    id: 'lifesaver', name: 'Lifesaver', icon: '🛟', cluster: 'utility', stackable: false,
    desc: () => `Once per run: running out of moves grants +${CONFIG.LIFESAVER_BONUS_MOVES} moves instead of losing`,
    mods(m) { m.lifesaver = true; },
  },
  converter: {
    id: 'converter', name: 'Converter', icon: '🔀', cluster: 'colour', stackable: false, requiresBoost: true,
    desc: () => 'Every match converts one random tile to a boosted colour',
    onMatch(g, p, group, api) {
      const owned = Object.keys(g.mods.boosts).map(Number);
      if (owned.length) api.convertRandom(owned[Math.floor(g.rng() * owned.length)]);
    },
  },
  spawnweight: {
    id: 'spawnweight', name: 'Spawn weight', icon: '🧲', cluster: 'colour', stackable: true, requiresBoost: true,
    desc: () => 'Boosted colours appear more often in refill tiles (stacks)',
    mods(m) { m.spawnWeight += CONFIG.SPAWN_WEIGHT_PER_PICK; },
  },
  matryoshka: {
    id: 'matryoshka', name: 'Matryoshka', icon: '🪆', cluster: 'chaos', stackable: false,
    desc: () => 'Exploding specials leave the next weaker special behind (⚡→💣→➡️→🧨)',
    mods(m) { m.matryoshka = true; },
  },
  aftershock: {
    id: 'aftershock', name: 'Aftershock', icon: '💢', cluster: 'chaos', stackable: false,
    desc: () => 'Explosions scorch surrounding tiles for one move — matching a scorched tile sets off a small blast',
    mods(m) { m.aftershock = true; },
  },
  tempo: {
    id: 'tempo', name: 'Tempo', icon: '🎺', cluster: 'utility', stackable: false,
    desc: () => `The first match after each checkpoint scores ×${CONFIG.TEMPO_MULT}`,
    mods(m) { m.tempo = true; },
  },
  snowball: {
    id: 'snowball', name: 'Snowball', icon: '❄️', cluster: 'utility', stackable: false,
    desc: () => `Making a match gives bonus score, increases by 1 every ${CONFIG.SNOWBALL_MOVES_PER_POINT} moves`,
    // Run-scoped counter that never resets between levels; cascades don't earn
    // the bonus. Nerfed after tester data (v6): stacked per-move growth let a
    // double-snowball build clear L6 in 4 moves at 253 pts/move.
    onMatch(g, p, group, api) {
      if (group.active) api.addBonus(Math.ceil((g.run.snowball || 0) / CONFIG.SNOWBALL_MOVES_PER_POINT));
    },
  },
  fusionmove: {
    id: 'fusionmove', name: 'Fusion energy', icon: '🔗', cluster: 'chaos', stackable: false,
    desc: () => `Merging two special pieces grants +${CONFIG.MERGE_BONUS_MOVES} move`,
    onMerge(g) {
      g.movesLeft += CONFIG.MERGE_BONUS_MOVES;
      g.callout(`🔗 Fusion: +${CONFIG.MERGE_BONUS_MOVES} move!`);
    },
  },
  momentum: {
    id: 'momentum', name: 'Momentum', icon: '🚀', cluster: 'utility', stackable: true,
    desc: () => `Every 4+ match you make fills a bar; a full bar pays +1 move (stacks shrink the bar)`,
    // counts once per group even with multiple copies; bar carries across levels
    onMatch(g, p, group, api) {
      if (!group.active || group.cells.length < 4 || group._momentumCounted) return;
      group._momentumCounted = true;
      g.run.momentum = (g.run.momentum || 0) + 1;
      const picks = g.run.picks.filter(x => x.id === 'momentum').length;
      const need = Math.max(CONFIG.MOMENTUM_MIN, CONFIG.MOMENTUM_BASE - (picks - 1));
      if (g.run.momentum >= need) {
        g.run.momentum -= need;
        g.movesLeft++;
        g.callout('🚀 Momentum: +1 move!');
      }
    },
  },
  purge: {
    id: 'purge', name: 'Colour purge', icon: '🌪️', cluster: 'colour', stackable: false,
    desc: () => '4+ matches you make also clear every tile of that colour',
    onMatch(g, p, group, api) {
      if (group.active && group.cells.length >= 4) api.clearColor(group.color, group);
    },
  },
  chomper: {
    id: 'chomper', name: 'Chomper', icon: '😬', cluster: 'utility', stackable: false,
    // NOTE: its movement direction mirrors the player's last swap — deliberately
    // SECRET. Never surface this in any text, tooltip, or visual indicator.
    desc: () => 'A hungry critter roams the board — after each move you make it eats one piece at full value (specials detonate when eaten)',
    mods(m) { m.chomper = true; },
    onRunStart(g) {
      let guard = 0;
      while (guard++ < 300) {
        const k = g.rollInteriorCell(); // never on the edge
        if (g.marks.has(k) || g.pinatas.has(k) || g.triples.has(k)) continue;
        const [r, c] = k.split(',').map(Number);
        const t = g.board[r][c];
        if (!t || t.chest || t.chomper) continue;
        g.board[r][c] = { id: g.tileId++, color: -2, chomper: true, special: null, dir: null, countdown: null };
        return;
      }
    },
  },
  conveyor: {
    id: 'conveyor', name: 'Conveyor belt', icon: '⚙️', cluster: 'utility', stackable: false,
    desc: () => 'After each move, every piece on the board edge rotates one step clockwise — specials and all',
    mods(m) { m.conveyor = true; },
  },
  lava: {
    id: 'lava', name: 'Floor is lava', icon: '🌋', cluster: 'chaos', stackable: false,
    desc: () => 'After each move, the entire bottom row melts away — a board effect, not a match you make',
    mods(m) { m.lava = true; },
  },
  diagswap: {
    id: 'diagswap', name: 'Diagonal swap', icon: '⤢', cluster: 'utility', stackable: false,
    desc: () => 'You can swap diagonally — matches still only form in straight lines',
    mods(m) { m.diagSwap = true; },
  },
  pinata: {
    id: 'pinata', name: 'Piñata tiles', icon: '🪅', cluster: 'utility', stackable: false,
    desc: () => `Piñatas appear as you play (up to ${CONFIG.DRIP.pinata.cap}); ${CONFIG.PINATA_HITS} matches over one pays +${CONFIG.PINATA_POINTS} points (cascades count)`,
    mods(m) { m.pinataDrip = true; },
  },
  tripletile: {
    id: 'tripletile', name: 'Triple tile', icon: '3️⃣', cluster: 'utility', stackable: false,
    desc: () => `A marked tile appears as you play; matching over it makes the whole move score ×${CONFIG.TRIPLE_TILE_MULT} (then a new one drips in later)`,
    mods(m) { m.tripleDrip = true; },
  },
  chests: {
    id: 'chests', name: 'Treasure chests', icon: '🎁', cluster: 'utility', stackable: false,
    desc: () => `Chests drop in from the top as you play — at the bottom they pay +${CONFIG.CHEST_POINTS} points, or +${CONFIG.CHEST_MOVES} moves when you're low`,
    mods(m) { m.chestDrip = true; },
  },
};
// Draft tiers: 1 = gentle (offered from level 1), 2 = strong (offered from
// CONFIG.STRONG_POWERUPS_FROM_LEVEL on). Early levels can't snowball off a
// premium pick like sweep or auto-explode.
const POWERUP_TIERS = {
  boost: 1, fillup: 1, countdown: 1, blast: 1, specialscore: 1,
  expandrow: 1, expandcol: 1, xtramove: 1, square: 1, lifesaver: 1,
  tempo: 1, snowball: 1, pinata: 1, diagswap: 1, fusionmove: 1, momentum: 1,
  squarescore: 1, squarebomb: 2,
  spawner: 2, bombchance: 2, autoexplode: 2, rowclear: 2, colclear: 2, flood: 2,
  converter: 2, spawnweight: 2, matryoshka: 2, aftershock: 2, chests: 2, tripletile: 2, purge: 2,
  conveyor: 2, chomper: 1,
  sweep: 3, // legendary — tester data: cascade-scale colour wipes on demand
  lava: 3,  // legendary — a free row clear every single move
};
for (const [id, tier] of Object.entries(POWERUP_TIERS)) if (POWERUPS[id]) POWERUPS[id].tier = tier;

const POWERUP_LIST = Object.values(POWERUPS);

/* ================================ ENGINE ================================== */
class Game {
  constructor(onRender) {
    this.onRender = onRender;
    this.phase = 'menu';          // menu | draft | discard | level | checkpoint | win | loss
    this.opts = { draftOptions: CONFIG.DRAFT_OPTIONS, colours: CONFIG.COLOURS };
    this.fx = []; this.callouts = []; this.fxId = 1; this.tileId = 1;
    this.busy = false; this.shake = false;
    this.pinatas = new Map(); this.triples = new Set(); this.tripleArmed = false;
    this.marks = new Set();
    this.drip = { mark: 0, pinata: 0, chest: 0, triple: 0 }; // dry-move pity counters
    this.pendingChests = 0;       // chests queued to ride in on the next refill
    this.fast = false; // debug: skip animation delays (scripted tests set this)
    this.run = null; this.board = null;
    this.mods = this.emptyMods();
  }

  render() { this.onRender(); }
  // fast=true skips animation delays (scripted testing; hidden tabs throttle timers)
  sleep(ms) { return this.fast ? Promise.resolve() : new Promise(res => setTimeout(res, ms)); }
  emptyMods() {
    return { boosts: {}, bombChance: 0, autoExplode: false, countdown: false,
             blastBonus: 0, specialScore: 0, expandRows: 0, expandCols: 0,
             marks: 0, square: false, lifesaver: false, fillup: false,
             spawnWeight: 0, matryoshka: false, aftershock: false, tempo: false, diagSwap: false,
             conveyor: false, lava: false, chomper: false, squareBomb: false,
             pinataDrip: false, tripleDrip: false, chestDrip: false };
  }

  /* ------------------------------ Run flow ------------------------------
     newRun → draft 1 → startRun (the ONE board generation of the run) →
     play until score crosses a checkpoint → checkpoint overlay → draft →
     resume the SAME board. The final checkpoint and every endless round use
     discard → replacement instead of adding another power-up.
     The run ends only when moves hit 0 (win if the final flag was reached). */
  newRun(seed) {
    this.seed = (seed >>> 0) || 1;
    this.rng = mulberry32(this.seed);
    // run.level = draft number (1 at run start, +1 per checkpoint) — it
    // drives tier gating and keeps the base game's draft cadence.
    this.run = { level: 0, picks: [], draftHistory: [], snowball: 0, momentum: 0,
                 fillCount: 0, fillTriggers: 0, multiplier: 1, lifesaverUsed: false,
                 checkpointIdx: 0, finalReached: false, pendingRewards: [], segmentsLogged: 0,
                 endlessRound: 0, endlessDelta: 0, endlessTarget: null };
    this.board = null;
    this.score = 0;
    this.busy = false;
    this.computeMods();
    this.startDraft();
  }

  // Each fixed round scales its original score gap from 50% to 100%, then the
  // existing colour-count adjustment is applied before gaps are accumulated.
  checkpoints() {
    const s = CONFIG.COLOUR_TARGET_SCALE[this.opts.colours] || 1;
    let previous = 0, total = 0;
    return CONFIG.CHECKPOINTS.map((target, i) => {
      total += Math.round((target - previous) * CONFIG.CHECKPOINT_DIFFICULTY[i] * s);
      previous = target;
      return total;
    });
  }

  nextTarget() {
    const cps = this.checkpoints();
    return this.run.finalReached ? this.run.endlessTarget : cps[this.run.checkpointIdx];
  }

  computeMods() {
    const m = this.emptyMods();
    for (const p of this.run.picks) {
      const def = POWERUPS[p.id];
      if (def.mods) def.mods(m, p, this);
    }
    this.mods = m;
  }

  emit(hook, ...args) {
    for (const p of this.run.picks) {
      const def = POWERUPS[p.id];
      if (def[hook]) def[hook](this, p, ...args);
    }
  }

  startDraft(replacement = false) {
    this.run.level++;
    this.replacing = replacement;
    this.offers = this.makeOffers(replacement);
    this.phase = 'draft';
    this.render();
  }

  draftWeight(def) {
    let w = 1;
    const inCluster = this.run.picks.filter(p => POWERUPS[p.id].cluster === def.cluster).length;
    w *= 1 + CONFIG.SYNERGY_CLUSTER_WEIGHT * inCluster;
    if (def.tier === 3) w *= CONFIG.LEGENDARY_WEIGHT; // legendaries stay rare even when unlocked
    return w;
  }

  makeOffers(replacement = false) {
    const n = replacement ? 3 : Math.max(2, Math.min(3, this.opts.draftOptions | 0));
    const hasBoost = Object.keys(this.mods.boosts).length > 0;
    const equipped = new Set(this.run.picks.map(p => p.id));
    const tierOk = d =>
      d.tier === 1 ||
      (d.tier === 2 && this.run.level >= CONFIG.STRONG_POWERUPS_FROM_LEVEL) ||
      (d.tier === 3 && this.run.level >= CONFIG.LEGENDARY_FROM_LEVEL);
    const pool = POWERUP_LIST.filter(d =>
      !d.disabled &&
      (!d.requiresBoost || hasBoost) && // boost-dependent picks never appear without a Colour boost
      (!d.requiresSquare || this.mods.square) && // square upgrades need Square match drafted
      tierOk(d) &&
      (replacement
        ? !equipped.has(d.id) && d.id !== this.discardedId
        : d.stackable || !equipped.has(d.id)));
    const offers = [];
    while (offers.length < n && pool.length) {
      const weights = pool.map(d => this.draftWeight(d));
      const total = weights.reduce((a, b) => a + b, 0);
      let x = this.rng() * total, idx = 0;
      while (idx < pool.length - 1 && x > weights[idx]) { x -= weights[idx]; idx++; }
      const def = pool.splice(idx, 1)[0];
      offers.push({ id: def.id, ...(def.roll ? def.roll(this) : {}) });
    }
    return offers;
  }

  pickOffer(i) {
    if (this.phase !== 'draft' || !this.offers[i]) return;
    // Log the whole offer set so telemetry can compute pick-rate-when-offered,
    // not just share-of-drafts.
    const key = o => o.id + (o.color !== undefined ? ':' + o.color : '');
    const history = { offered: this.offers.map(key), picked: key(this.offers[i]) };
    if (this.replacing) {
      history.discardOffered = this.discardChoices;
      history.discarded = this.discardedKey;
      history.endlessRound = this.run.endlessRound + 1;
    }
    this.run.draftHistory.push(history);
    const pick = this.offers[i];
    this.run.picks.push(pick);
    this.computeMods();
    if (!this.board) { this.startRun(); return; }
    // Mid-run pick: apply one-time effects to the LIVE board — no regen.
    this.growBoard(pick);
    this.dripSeedFor(pick); // new drip power-ups land their first spawn instantly
    const def = POWERUPS[pick.id];
    if (def.onRunStart) def.onRunStart(this, pick); // e.g. chomper hatches now
    this.replacing = false;
    this.discardedId = null;
    this.discardedKey = null;
    this.discardChoices = null;
    this.finishReward();
  }

  startDiscard() {
    const byKey = new Map();
    for (const pick of this.run.picks) {
      const key = pick.id + (pick.color !== undefined ? ':' + pick.color : '');
      if (byKey.has(key)) byKey.get(key).count++;
      else byKey.set(key, { key, pick, count: 1 });
    }
    const pool = [...byKey.values()];
    this.discardOffers = [];
    while (this.discardOffers.length < 3 && pool.length) {
      this.discardOffers.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
    }
    this.phase = 'discard';
    this.render();
  }

  discardOffer(i) {
    if (this.phase !== 'discard' || !this.discardOffers[i]) return;
    const choice = this.discardOffers[i];
    const at = this.run.picks.findIndex(p =>
      p.id === choice.pick.id && p.color === choice.pick.color);
    this.run.picks.splice(at, 1);
    this.discardChoices = this.discardOffers.map(o => o.key);
    this.discardedId = choice.pick.id;
    this.discardedKey = choice.key;
    this.computeMods();
    this.cleanupDiscard(choice.pick.id);
    this.startDraft(true);
  }

  cleanupDiscard(id) {
    while (this.marks.size > this.mods.marks) this.marks.delete(this.marks.values().next().value);
    if (this.run.picks.some(p => p.id === id)) return;
    if (id === 'pinata') { this.pinatas.clear(); this.drip.pinata = 0; }
    if (id === 'tripletile') { this.triples.clear(); this.tripleArmed = false; this.drip.triple = 0; }
    if (id === 'chests') { this.pendingChests = 0; this.drip.chest = 0; }
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const tile = this.board[r][c];
      if ((id === 'chomper' && tile.chomper) || (id === 'chests' && tile.chest))
        this.replaceActor(r, c);
      else if (id === 'countdown') tile.countdown = null;
      else if (id === 'aftershock') delete tile.volatile;
    }
  }

  replaceActor(r, c) {
    const first = Math.floor(this.rng() * this.opts.colours);
    for (let i = 0; i < this.opts.colours; i++) {
      this.board[r][c] = this.makeTile((first + i) % this.opts.colours, true);
      if (!this.findGroups().some(g => g.cells.some(cl => cl.r === r && cl.c === c))) return;
    }
  }

  startNextReward() {
    const reward = this.run.pendingRewards.shift();
    if (reward === 'rotate') this.startDiscard();
    else this.startDraft();
  }

  finishReward() {
    if (this.run.pendingRewards.length) { this.startNextReward(); return; }
    if (!this.findAnyMove()) this.reshuffleBoard();
    this.phase = 'level';
    this.busy = false;
    this.render();
  }

  // The run's single board generation — everything after this mutates in place.
  startRun() {
    this.rows = Math.min(CONFIG.MAX_BOARD, CONFIG.BOARD_ROWS + this.mods.expandRows);
    this.cols = Math.min(CONFIG.MAX_BOARD, CONFIG.BOARD_COLS + this.mods.expandCols);
    this.movesLeft = CONFIG.START_MOVES;
    this.lastWarnedMoves = null;
    this.score = 0;
    this.segStartScore = 0;  // telemetry: score at the current segment's start
    this.movesUsed = 0; this.moveScores = []; // per segment, reset on each log
    this.moveNum = 0;        // 1-based during a move; drives Snowball and Aftershock expiry
    this.tempoUsed = false;  // Tempo's ×N is armed until the first match after each checkpoint
    this.genBoard();
    this.marks = new Set();
    this.pinatas = new Map(); this.triples = new Set(); this.tripleArmed = false;
    this.drip = { mark: 0, pinata: 0, chest: 0, triple: 0 };
    this.pendingChests = 0;
    this.lastSwapDir = null;
    this.emit('onRunStart');
    this.dripSeedFor(this.run.picks[0]);
    if (!this.findAnyMove()) this.reshuffleBoard(); // placed pieces can rarely kill the only move
    this.phase = 'level';
    this.busy = false;
    this.render();
  }

  // Expand picks grow the live board: rows append at the BOTTOM, columns at
  // the RIGHT, so existing cell keys (marks/piñatas/triples) stay valid.
  // New tiles roll match-avoiding colours, so growth never fires a free cascade.
  growBoard(pick) {
    let wantRows = Math.min(CONFIG.MAX_BOARD, CONFIG.BOARD_ROWS + this.mods.expandRows);
    let wantCols = Math.min(CONFIG.MAX_BOARD, CONFIG.BOARD_COLS + this.mods.expandCols);
    // A discarded Expand never shrinks the live board. If it returns later,
    // grow once more from the board's current size so the new pick is useful.
    if (pick.id === 'expandrow' && this.rows >= wantRows) wantRows = Math.min(CONFIG.MAX_BOARD, this.rows + 1);
    if (pick.id === 'expandcol' && this.cols >= wantCols) wantCols = Math.min(CONFIG.MAX_BOARD, this.cols + 1);
    while (this.rows < wantRows) {
      this.board.push(Array(this.cols).fill(null));
      this.rows++;
      const r = this.rows - 1;
      for (let c = 0; c < this.cols; c++) this.board[r][c] = this.makeTile(this.rollColorAvoidingMatches(r, c), true);
    }
    while (this.cols < wantCols) {
      this.cols++;
      for (let r = 0; r < this.rows; r++) this.board[r].push(null);
      const c = this.cols - 1;
      for (let r = 0; r < this.rows; r++) this.board[r][c] = this.makeTile(this.rollColorAvoidingMatches(r, c), true);
    }
  }

  continueRun() {
    if (this.phase !== 'checkpoint') return;
    this.startNextReward();
  }

  // Cross fixed checkpoints, then growing endless targets. Each crossed target
  // queues its reward so a huge move still settles choices in the right order.
  checkProgress() {
    if (this.phase !== 'level') return;
    const cps = this.checkpoints();
    let crossed = 0, fixedCrossed = 0, endlessCrossed = 0, granted = 0, finalFlag = false;
    while (this.run.checkpointIdx < cps.length && this.score >= cps[this.run.checkpointIdx]) {
      const i = this.run.checkpointIdx++;
      const grant = CONFIG.CHECKPOINT_MOVES[Math.min(i, CONFIG.CHECKPOINT_MOVES.length - 1)];
      this.movesLeft += grant; granted += grant; crossed++; fixedCrossed++;
      this.logSegment('clear', cps[i], 0);
      this.tempoUsed = false; // Tempo re-arms for the new segment
      const final = this.run.checkpointIdx >= cps.length;
      this.run.pendingRewards.push(final ? 'rotate' : 'draft');
      if (final) {
        finalFlag = true;
        this.run.finalReached = true;
        this.run.endlessDelta = cps[cps.length - 1] - (cps[cps.length - 2] || 0);
        this.run.endlessTarget = cps[cps.length - 1] + this.run.endlessDelta;
      }
    }
    while (this.run.finalReached && this.score >= this.run.endlessTarget) {
      const target = this.run.endlessTarget;
      const grant = CONFIG.CHECKPOINT_MOVES[CONFIG.CHECKPOINT_MOVES.length - 1];
      this.run.endlessRound++;
      this.movesLeft += grant; granted += grant; crossed++; endlessCrossed++;
      this.logSegment('clear', target, this.run.endlessRound);
      this.run.pendingRewards.push('rotate');
      this.tempoUsed = false;
      this.run.endlessDelta = Math.round(this.run.endlessDelta * CONFIG.ENDLESS_SCORE_GROWTH);
      this.run.endlessTarget += this.run.endlessDelta;
    }
    if (crossed) {
      this.lastCheckpoint = { n: this.run.checkpointIdx, crossed, fixedCrossed, endlessCrossed,
                              moves: granted, finalFlag, round: this.run.endlessRound };
      this.phase = 'checkpoint';
      return;
    }
    if (this.movesLeft <= 0) {
      if (this.mods.lifesaver && !this.run.lifesaverUsed) {
        this.run.lifesaverUsed = true;
        this.movesLeft += CONFIG.LIFESAVER_BONUS_MOVES;
        this.callout(`🛟 Lifesaver! +${CONFIG.LIFESAVER_BONUS_MOVES} moves`);
      } else {
        this.logSegment(this.run.finalReached ? 'end' : 'loss', this.nextTarget(),
                        this.run.finalReached ? this.run.endlessRound + 1 : 0);
        this.phase = this.run.finalReached ? 'win' : 'loss';
      }
    }
  }

  // One record per fixed or endless round (score/moves are deltas within it).
  logSegment(result, targetAbs = this.nextTarget(), endlessRound = 0) {
    const seg = ++this.run.segmentsLogged;
    const segScore = this.score - this.segStartScore;
    telemetrySave({
      t: Date.now(), seed: this.seed, level: seg, result, // level = segment number
      target: Math.max(0, targetAbs - this.segStartScore), // points this segment needed
      score: segScore, totalScore: this.score,
      movesUsed: this.movesUsed,
      ppm: +(segScore / Math.max(1, this.movesUsed)).toFixed(1),
      moveScores: this.moveScores.slice(),
      picks: this.run.picks.map(p => p.id + (p.color !== undefined ? ':' + p.color : '')),
      draft: this.run.draftHistory[seg - 1] || null, // the draft that opened this segment
      rows: this.rows, cols: this.cols, draftOptions: this.opts.draftOptions,
      endlessRound: endlessRound || null,
      colours: this.opts.colours, v: CONFIG.BALANCE_VERSION, variant: CONFIG.VARIANT,
      fast: !!this.fast, // bot/test runs — excluded from human summaries
    });
    this.segStartScore = this.score;
    this.movesUsed = 0; this.moveScores = [];
  }

  /* --------------------------- Per-move drip -----------------------------
     Replaces per-level seeding: after every player move, each owned type
     rolls once against CONFIG.DRIP — capped concurrency, pity after too
     many dry moves. Seeded RNG, so replays stay deterministic. */
  chestsInPlay() {
    let n = this.pendingChests;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++)
      if (this.board[r][c] && this.board[r][c].chest) n++;
    return n;
  }

  dripRolls() {
    const D = CONFIG.DRIP;
    const roll = (name, below, chance, spawn) => {
      if (!below) { this.drip[name] = 0; return; }
      if (this.rng() < chance || this.drip[name] >= D[name].pity) {
        if (spawn()) { this.drip[name] = 0; return; }
      }
      this.drip[name]++;
    };
    // Xtra-move marks don't roll: exactly one per pick lives on the board, so
    // a consumed mark pops back up (elsewhere) the same move it was used.
    while (this.marks.size < this.mods.marks) { if (!this.spawnMark()) break; }
    if (this.mods.pinataDrip)
      roll('pinata', this.pinatas.size < D.pinata.cap, D.pinata.chance, () => this.spawnPinata());
    if (this.mods.tripleDrip)
      roll('triple', this.triples.size < D.triple.cap, D.triple.chance, () => this.spawnTriple());
    if (this.mods.chestDrip)
      roll('chest', this.chestsInPlay() < D.chest.cap, D.chest.chance,
           () => { this.pendingChests++; return true; }); // rides in on the next refill
  }

  // First spawn lands the moment the power-up is picked, so the pick feels live.
  dripSeedFor(pick) {
    if (!pick) return;
    if (pick.id === 'xtramove') this.spawnMark();
    else if (pick.id === 'pinata') this.spawnPinata();
    else if (pick.id === 'tripletile') this.spawnTriple();
    else if (pick.id === 'chests') this.pendingChests++;
  }

  spawnMark() {
    let guard = 0;
    while (guard++ < 300) {
      const r = Math.floor(this.rng() * this.rows), c = Math.floor(this.rng() * this.cols);
      // edges are fine for xtra-move marks, corners are not (too few matches reach them)
      if ((r === 0 || r === this.rows - 1) && (c === 0 || c === this.cols - 1)) continue;
      const k = K(r, c);
      if (this.marks.has(k) || this.pinatas.has(k) || this.triples.has(k)) continue;
      this.marks.add(k);
      this.addFx(r, c, '🔄', 'emoji');
      return true;
    }
    return false;
  }

  spawnPinata() {
    let guard = 0;
    while (guard++ < 300) {
      const k = this.rollInteriorCell(); // never on the board edge
      if (this.marks.has(k) || this.pinatas.has(k) || this.triples.has(k)) continue;
      this.pinatas.set(k, CONFIG.PINATA_HITS);
      const [r, c] = k.split(',').map(Number);
      this.addFx(r, c, '🪅', 'emoji');
      return true;
    }
    return false;
  }

  spawnTriple() {
    let guard = 0;
    while (guard++ < 300) {
      const k = this.rollInteriorCell(); // never on the board edge
      if (this.marks.has(k) || this.pinatas.has(k) || this.triples.has(k)) continue;
      this.triples.add(k);
      const [r, c] = k.split(',').map(Number);
      this.addFx(r, c, `✖${CONFIG.TRIPLE_TILE_MULT}`, 'emoji');
      return true;
    }
    return false;
  }

  /* ---------------------------- Board setup ----------------------------- */
  // initial=true for the level's starting fill — Bomb chance only applies to
  // tiles spawned by refills after the player has made a move.
  makeTile(color, initial = false) {
    const t = { id: this.tileId++, color, special: null, dir: null, countdown: null };
    if (!initial && this.mods.bombChance > 0 && this.rng() < this.mods.bombChance) {
      t.special = 'bomb';
      if (this.mods.countdown) t.countdown = CONFIG.COUNTDOWN_TIMER_START;
    }
    return t;
  }

  rollColorAvoidingMatches(r, c) {
    const b = this.board, bad = new Set();
    if (c >= 2 && b[r][c - 1] && b[r][c - 2] && b[r][c - 1].color === b[r][c - 2].color) bad.add(b[r][c - 1].color);
    if (r >= 2 && b[r - 1][c] && b[r - 2][c] && b[r - 1][c].color === b[r - 2][c].color) bad.add(b[r - 1][c].color);
    if (this.mods.square && r >= 1 && c >= 1 &&
        b[r - 1][c] && b[r - 1][c - 1] && b[r][c - 1] &&
        b[r - 1][c].color === b[r - 1][c - 1].color && b[r][c - 1].color === b[r - 1][c].color)
      bad.add(b[r - 1][c].color);
    let color;
    do { color = Math.floor(this.rng() * this.opts.colours); } while (bad.has(color) && bad.size < this.opts.colours);
    return color;
  }

  genBoard() {
    for (let tries = 0; tries < 60; tries++) {
      this.board = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
      for (let r = 0; r < this.rows; r++)
        for (let c = 0; c < this.cols; c++)
          this.board[r][c] = this.makeTile(this.rollColorAvoidingMatches(r, c), true);
      if (this.findAnyMove()) return;
    }
  }

  // interior cell roll for marks that need match coverage from all sides
  rollInteriorCell() {
    return K(1 + Math.floor(this.rng() * (this.rows - 2)), 1 + Math.floor(this.rng() * (this.cols - 2)));
  }

  // Refill colour roll — Spawn weight tilts the distribution toward boosted colours.
  rollRefillColor() {
    if (!this.mods.spawnWeight) return Math.floor(this.rng() * this.opts.colours);
    const weights = [];
    let total = 0;
    for (let c = 0; c < this.opts.colours; c++) {
      const w = 1 + (this.mods.boosts[c] ? this.mods.spawnWeight : 0);
      weights.push(w); total += w;
    }
    let x = this.rng() * total;
    for (let c = 0; c < weights.length; c++) { if (x < weights[c]) return c; x -= weights[c]; }
    return weights.length - 1;
  }

  reshuffleBoard() {
    for (let tries = 0; tries < 40; tries++) {
      for (let r = 0; r < this.rows; r++)
        for (let c = 0; c < this.cols; c++)
          if (this.board[r][c] && !this.board[r][c].chest && !this.board[r][c].chomper) this.board[r][c].color = this.rollColorAvoidingMatches(r, c);
      if (this.findAnyMove() && !this.findGroups().length) return;
    }
  }

  /* --------------------------- Match detection -------------------------- */
  findRuns() {
    const runs = [], b = this.board;
    for (let r = 0; r < this.rows; r++) {
      let c = 0;
      while (c < this.cols) {
        const t = b[r][c];
        if (!t || t.color < 0) { c++; continue; } // neutral pieces (chest/chomper) never start runs
        let len = 1;
        while (c + len < this.cols && b[r][c + len] && b[r][c + len].color === t.color) len++;
        if (len >= 3) runs.push({ dir: 'h', color: t.color, cells: Array.from({ length: len }, (_, i) => ({ r, c: c + i })) });
        c += len;
      }
    }
    for (let c = 0; c < this.cols; c++) {
      let r = 0;
      while (r < this.rows) {
        const t = b[r][c];
        if (!t || t.color < 0) { r++; continue; } // neutral pieces never start runs
        let len = 1;
        while (r + len < this.rows && b[r + len][c] && b[r + len][c].color === t.color) len++;
        if (len >= 3) runs.push({ dir: 'v', color: t.color, cells: Array.from({ length: len }, (_, i) => ({ r: r + i, c })) });
        r += len;
      }
    }
    return runs;
  }

  findGroups() {
    const runs = this.findRuns();
    const parent = runs.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
    const cellRun = new Map();
    runs.forEach((run, i) => {
      for (const cl of run.cells) {
        const k = K(cl.r, cl.c);
        if (cellRun.has(k)) union(cellRun.get(k), i); else cellRun.set(k, i);
      }
    });
    const byRoot = new Map();
    runs.forEach((run, i) => {
      const root = find(i);
      if (!byRoot.has(root)) byRoot.set(root, { color: run.color, cells: [], cellSet: new Set(), runs: [], square: false });
      const g = byRoot.get(root);
      g.runs.push(run);
      for (const cl of run.cells) {
        const k = K(cl.r, cl.c);
        if (!g.cellSet.has(k)) { g.cellSet.add(k); g.cells.push(cl); }
      }
    });
    const groups = [...byRoot.values()];
    if (this.mods.square) {
      for (let r = 0; r < this.rows - 1; r++) for (let c = 0; c < this.cols - 1; c++) {
        const t = this.board[r][c];
        if (!t || t.color < 0) continue;
        const cells = [{ r, c }, { r, c: c + 1 }, { r: r + 1, c }, { r: r + 1, c: c + 1 }];
        if (!cells.every(cl => this.board[cl.r][cl.c] && this.board[cl.r][cl.c].color === t.color)) continue;
        // A square counts even when its cells are also part of a straight run
        // (e.g. a 2x2 with a 3rd piece on top): merge it into the overlapping
        // group so everything clears together and square behaviour applies.
        const overlapping = groups.filter(g => cells.some(cl => g.cellSet.has(K(cl.r, cl.c))));
        if (overlapping.length) {
          const g = overlapping[0];
          for (const other of overlapping.slice(1)) {
            for (const cl of other.cells) if (!g.cellSet.has(K(cl.r, cl.c))) { g.cellSet.add(K(cl.r, cl.c)); g.cells.push(cl); }
            g.runs.push(...other.runs);
            groups.splice(groups.indexOf(other), 1);
          }
          for (const cl of cells) if (!g.cellSet.has(K(cl.r, cl.c))) { g.cellSet.add(K(cl.r, cl.c)); g.cells.push(cl); }
          g.square = true;
        } else {
          groups.push({ color: t.color, cells, cellSet: new Set(cells.map(cl => K(cl.r, cl.c))), runs: [], square: true });
        }
      }
    }
    return groups;
  }

  findAnyMove() {
    const b = this.board;
    const offsets = this.mods.diagSwap ? [[0, 1], [1, 0], [1, 1], [1, -1]] : [[0, 1], [1, 0]];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      for (const [dr, dc] of offsets) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 >= this.rows || c2 < 0 || c2 >= this.cols || !b[r][c] || !b[r2][c2]) continue;
        if (b[r][c].chomper || b[r2][c2].chomper) continue; // chomper can't be swapped
        // adjacent specials can always merge
        if (b[r][c].special && b[r2][c2].special) return { a: { r, c }, b: { r: r2, c: c2 } };
        [b[r][c], b[r2][c2]] = [b[r2][c2], b[r][c]];
        const ok = this.findRuns().length > 0;
        [b[r][c], b[r2][c2]] = [b[r2][c2], b[r][c]];
        if (ok) return { a: { r, c }, b: { r: r2, c: c2 } };
      }
    }
    return null;
  }

  /* ------------------------- Specials & explosions ---------------------- */
  groupSpawnType(g) {
    if (g.square) return this.mods.squareBomb ? 'bomb' : 'dynamite';
    const hasH = g.runs.some(x => x.dir === 'h'), hasV = g.runs.some(x => x.dir === 'v');
    if (hasH && hasV) return CONFIG.MATCH_SHAPE_SPAWNS;
    const maxLen = Math.max(...g.runs.map(x => x.cells.length));
    if (maxLen >= 5) return CONFIG.MATCH_5_SPAWNS;
    if (maxLen === 4) return CONFIG.MATCH_4_SPAWNS;
    return null;
  }

  makeSpecial(type, group, dirOverride) {
    const t = { id: this.tileId++, color: group.color, special: type, dir: null,
                countdown: this.mods.countdown ? CONFIG.COUNTDOWN_TIMER_START : null, fresh: true };
    if (type === 'arrow') {
      if (dirOverride) t.dir = dirOverride;
      else {
        const run = group.runs.find(x => x.cells.length >= 4) || group.runs[0];
        t.dir = run && run.dir === 'h' ? 'v' : 'h'; // horizontal match → column-clearing arrow
      }
    }
    return t;
  }

  explosionCells(r, c, t) {
    const cells = [];
    const push = (rr, cc) => { if (rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols) cells.push({ r: rr, c: cc }); };
    if (t.special === 'bomb') {
      const rad = Math.min(CONFIG.MAX_BOMB_RADIUS, 1 + this.mods.blastBonus);
      for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) push(r + dr, c + dc);
    } else if (t.special === 'arrow') {
      if (t.dir === 'h') for (let cc = 0; cc < this.cols; cc++) push(r, cc);
      else for (let rr = 0; rr < this.rows; rr++) push(rr, c);
    } else if (t.special === 'lightning') {
      for (let rr = 0; rr < this.rows; rr++) for (let cc = 0; cc < this.cols; cc++) {
        const o = this.board[rr][cc];
        if (o && o.color === t.color) push(rr, cc);
      }
    } else if (t.special === 'dynamite') {
      push(r, c); push(r - 1, c); push(r + 1, c); push(r, c - 1); push(r, c + 1);
    } else if (t.special === 'cross') {
      // transient piece made by merging two arrows: full row + full column
      for (let cc = 0; cc < this.cols; cc++) push(r, cc);
      for (let rr = 0; rr < this.rows; rr++) push(rr, c);
    }
    return cells;
  }

  /* --------------------------- Step resolution --------------------------
     One "step" = clear matched groups (+ power-up extras), chain special
     explosions, spawn new specials, score everything, flag tiles to pop.  */
  // boardClears: cells removed as a pure board effect (e.g. Floor is lava) —
  // they score and detonate specials, but fire no match hooks and never touch
  // xtra-move marks.
  processStep(groups, swapCells, seeds, boardClears = []) {
    const cleared = new Map();     // key -> {r,c,explosion,delay,kind,src}
    const spawns = new Map();      // key -> new special tile
    const floods = [];             // {cells|null, color} pending conversions (null = board-wide)
    const queue = [];              // explosion chain: {r,c,depth}
    let bonusPts = 0;              // flat bonus points added by hooks (e.g. Snowball)
    let maxDelay = 0;              // longest pop stagger this step (engine waits it out)

    // kind drives the pop animation: match | boom | zap | line | sweep
    // delay staggers pops so blasts ripple outward and lines wipe along
    // src buckets the score popups per cause
    const addClear = (r, c, explosion, opts = {}) => {
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
      const t = this.board[r][c];
      if (!t || t.chest || t.chomper) return false; // chests and chompers are indestructible
      const k = K(r, c);
      if (cleared.has(k)) return false;
      const delay = Math.min(500, opts.delay || 0);
      maxDelay = Math.max(maxDelay, delay);
      cleared.set(k, { r, c, explosion, delay, kind: opts.kind || (explosion ? 'boom' : 'match'), src: opts.src || 'misc' });
      if (t.special) queue.push({ r, c, depth: (opts.depth || 0) + 1 });
      return true;
    };

    const pickSpawnCell = g => {
      // never spawn onto an existing special — that used to swallow its
      // explosion (a bomb swapped into a 4-match just became an arrow)
      const free = g.cells.filter(cl => {
        const t = this.board[cl.r][cl.c];
        return !spawns.has(K(cl.r, cl.c)) && t && !t.special;
      });
      if (!free.length) return null;
      if (swapCells) {
        const hit = free.find(cl => swapCells.some(s => s.r === cl.r && s.c === cl.c));
        if (hit) return hit;
      }
      return free[Math.floor(free.length / 2)];
    };

    groups.forEach((g, gi) => { g.src = 'g' + gi; });
    for (const g of groups) {
      // active = made directly by the player's swap (not a cascade match)
      g.active = !!(swapCells && g.cells.some(cl => swapCells.some(s => s.r === cl.r && s.c === cl.c)));
      for (const cl of g.cells) addClear(cl.r, cl.c, false, { kind: 'match', src: g.src });
      // particle burst from the matched group's centre, in its colour
      const cr = g.cells.reduce((s, cl) => s + cl.r, 0) / g.cells.length;
      const cc = g.cells.reduce((s, cl) => s + cl.c, 0) / g.cells.length;
      this.addParticles(cr, cc, g.color);
      const type = this.groupSpawnType(g);
      if (type) {
        const cell = pickSpawnCell(g);
        if (cell) spawns.set(K(cell.r, cell.c), this.makeSpecial(type, g));
      }
    }

    // Power-up hooks may extend the cleared set / add spawns / queue floods.
    const api = {
      clearColor: (color, g) => {
        // sweep ripples outward from the match that triggered it
        const anchor = g && g.cells.length ? g.cells[0] : { r: 0, c: 0 };
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
          const t = this.board[r][c];
          if (t && t.color === color) {
            const d = (Math.abs(r - anchor.r) + Math.abs(c - anchor.c)) * CONFIG.LINE_STAGGER_MS;
            addClear(r, c, false, { kind: 'sweep', delay: d, src: g ? g.src : 'misc' });
          }
        }
        if (g && g.cells.length) this.addFx(g.cells[0].r, g.cells[0].c, '🧹', 'emoji');
      },
      clearLines: (g, dir) => {
        // line clears wipe outward from the matched run
        for (const run of g.runs) {
          if (dir && run.dir !== dir) continue;
          if (run.dir === 'h') {
            const r = run.cells[0].r, from = run.cells[Math.floor(run.cells.length / 2)].c;
            for (let c = 0; c < this.cols; c++) addClear(r, c, false, { kind: 'line', delay: Math.abs(c - from) * CONFIG.LINE_STAGGER_MS, src: g.src });
          } else {
            const c = run.cells[0].c, from = run.cells[Math.floor(run.cells.length / 2)].r;
            for (let r = 0; r < this.rows; r++) addClear(r, c, false, { kind: 'line', delay: Math.abs(r - from) * CONFIG.LINE_STAGGER_MS, src: g.src });
          }
        }
      },
      flood: (g, color) => floods.push({ cells: g.cells, color }),
      convertRandom: color => floods.push({ cells: null, color }), // any surviving tile, board-wide
      addBonus: n => { bonusPts += n; },
      spawnRandomSpecial: g => {
        const free = g.cells.filter(cl => {
          const t = this.board[cl.r][cl.c];
          return !spawns.has(K(cl.r, cl.c)) && t && !t.special; // don't overwrite live specials
        });
        if (!free.length) return;
        const cell = free[Math.floor(this.rng() * free.length)];
        const type = ['bomb', 'arrow', 'lightning'][Math.floor(this.rng() * 3)];
        const dir = this.rng() < 0.5 ? 'h' : 'v';
        spawns.set(K(cell.r, cell.c), this.makeSpecial(type, g, dir));
        this.addFx(cell.r, cell.c, '✨', 'emoji');
      },
    };
    for (const g of groups) this.emit('onMatch', g, api);

    // Aftershock: matching a scorched (volatile) tile sets off a small + blast there.
    if (this.mods.aftershock) {
      for (const g of groups) for (const cl of g.cells) {
        const t = this.board[cl.r][cl.c];
        if (t && t.volatile && t.volatile >= this.moveNum) {
          t.volatile = 0;
          this.addFx(cl.r, cl.c, '💢', 'emoji');
          this.addWave(cl.r, cl.c, 3, 0);
          for (const cell of this.explosionCells(cl.r, cl.c, { special: 'dynamite' }))
            addClear(cell.r, cell.c, true, { delay: (Math.abs(cell.r - cl.r) + Math.abs(cell.c - cl.c)) * CONFIG.BOOM_STAGGER_MS, src: 'a' + K(cl.r, cl.c) });
        }
      }
    }

    // Board-effect clears (no group, no hooks — just removal + special chains).
    for (const cl of boardClears) addClear(cl.r, cl.c, false, { kind: 'lava', src: 'lava' });

    // Countdown / auto-explode seeds explode even without a match.
    for (const s of seeds || []) {
      const t = this.board[s.r][s.c];
      if (!t || !t.special) continue;
      const k = K(s.r, s.c);
      if (!cleared.has(k)) {
        cleared.set(k, { r: s.r, c: s.c, explosion: true, delay: 0, kind: t.special === 'lightning' ? 'zap' : 'boom', src: 'e' + k });
        queue.push({ r: s.r, c: s.c, depth: 0 });
      }
    }

    // Chain explosions.
    const exploded = new Set();
    const WAVE_SIZE = { bomb: () => 2 * Math.min(CONFIG.MAX_BOMB_RADIUS, 1 + this.mods.blastBonus) + 1, dynamite: () => 3, lightning: () => 5, cross: () => 0, arrow: () => 0 };
    while (queue.length) {
      const { r, c, depth = 0 } = queue.shift();
      const k = K(r, c);
      if (exploded.has(k) || spawns.has(k)) continue;
      exploded.add(k);
      const t = this.board[r][c];
      if (!t || !t.special) continue;
      const baseDelay = depth * CONFIG.CHAIN_STAGGER_MS;
      const kind = t.special === 'lightning' ? 'zap' : 'boom';
      this.addFx(r, c, t.special === 'lightning' ? '⚡' : '💥', 'emoji');
      const waveSize = (WAVE_SIZE[t.special] || (() => 0))();
      if (waveSize) this.addWave(r, c, waveSize, baseDelay);
      for (const cl of this.explosionCells(r, c, t)) {
        const dist = Math.max(Math.abs(cl.r - r), Math.abs(cl.c - c));
        addClear(cl.r, cl.c, true, { kind, delay: baseDelay + dist * CONFIG.BOOM_STAGGER_MS, src: 'e' + k, depth });
      }
      // Matryoshka: the exploding special leaves the next weaker one at its cell.
      if (this.mods.matryoshka) {
        const next = MATRYOSHKA_NEXT[t.special];
        if (next && !spawns.has(k)) {
          spawns.set(k, { id: this.tileId++, color: t.color, special: next,
            dir: next === 'arrow' ? (this.rng() < 0.5 ? 'h' : 'v') : null,
            countdown: this.mods.countdown ? CONFIG.COUNTDOWN_TIMER_START : null, fresh: true });
        }
      }
    }

    // Aftershock: surviving tiles on the edge of a SPECIAL-PIECE explosion
    // (src 'e...') turn volatile through the next move. Secondary volatile
    // blasts (src 'a...') never scorch — aftershock must not chain itself.
    if (this.mods.aftershock) {
      for (const { r, c, explosion, src } of cleared.values()) {
        if (!explosion || !src || src[0] !== 'e') continue;
        for (const [dr, dc] of DIRS4) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= this.rows || cc < 0 || cc >= this.cols) continue;
          const t = this.board[rr][cc];
          if (t && !t.chest && !cleared.has(K(rr, cc))) t.volatile = this.moveNum + 1;
        }
      }
    }

    // Xtra-move marks: clearing a marked cell refunds this move.
    // Only ONE mark is consumed per move — matching over two leaves the second.
    if (!this.refund) {
      for (const { r, c, kind } of cleared.values()) {
        if (kind === 'lava') continue; // board effects don't earn refunds (the mark survives)
        const k = K(r, c);
        if (this.marks.has(k)) { this.marks.delete(k); this.refund = true; break; }
      }
    }

    // Piñata cells: every clear over one (match, cascade, or explosion) is a hit.
    if (this.pinatas.size) {
      for (const k of cleared.keys()) {
        if (!this.pinatas.has(k)) continue;
        const left = this.pinatas.get(k) - 1;
        const [pr, pc] = k.split(',').map(Number);
        if (left <= 0) {
          this.pinatas.delete(k);
          this.score += CONFIG.PINATA_POINTS;
          this.addFx(pr, pc, `🪅 +${CONFIG.PINATA_POINTS}`, 'big');
        } else {
          this.pinatas.set(k, left);
          this.addFx(pr, pc, '🪅', 'emoji');
        }
      }
    }

    // Triple tile: a match the player makes over it arms a whole-move ×N,
    // paid out in trySwap once the move fully resolves. One use.
    if (this.triples.size) {
      for (const g of groups) {
        if (!g.active) continue;
        for (const cl of g.cells) {
          const k = K(cl.r, cl.c);
          if (this.triples.has(k)) {
            this.triples.delete(k);
            this.tripleArmed = true;
            this.addFx(cl.r, cl.c, `✖${CONFIG.TRIPLE_TILE_MULT}!`, 'big');
          }
        }
      }
    }

    // Score: 1/tile + colour boost, × multiplier. Special-score pays its bonus
    // on the exploding special piece itself, not on the tiles it clears.
    let pts = 0, cnt = 0;
    const buckets = new Map(); // src -> {pts, n, sumR, sumC, bonus} for per-cause score popups
    for (const { r, c, delay, kind, src } of cleared.values()) {
      const t = this.board[r][c];
      const boost = this.mods.boosts[t.color] || 0;
      const spBonus = exploded.has(K(r, c)) ? this.mods.specialScore : 0;
      const p = (1 + boost + spBonus) * this.run.multiplier;
      pts += p; cnt++;
      t.pop = true; t.popDelay = delay; t.popKind = kind;
      const b = buckets.get(src) || { pts: 0, n: 0, sumR: 0, sumC: 0, bonus: false };
      b.pts += p; b.n++; b.sumR += r; b.sumC += c;
      b.bonus = b.bonus || boost > 0 || spBonus > 0;
      buckets.set(src, b);
    }
    pts += bonusPts * this.run.multiplier; // flat hook bonuses (Snowball)
    // Tempo: the level's first match step scores ×N.
    let tempoMult = 1;
    if (this.mods.tempo && !this.tempoUsed && groups.length && cnt) {
      this.tempoUsed = true;
      tempoMult = CONFIG.TEMPO_MULT;
      pts *= tempoMult;
      this.callout(`🎺 Tempo ×${CONFIG.TEMPO_MULT}!`);
    }
    this.score += pts;
    // gold popup = the number includes some bonus (boost / special score /
    // multiplier / tempo); plain clears stay white
    const goldAll = this.run.multiplier > 1 || tempoMult > 1;
    for (const b of buckets.values()) {
      const shown = b.pts * tempoMult;
      this.addFx(b.sumR / b.n, b.sumC / b.n, `+${shown}`, ((b.bonus || goldAll) ? 'gold' : '') + (shown >= 40 ? ' big' : ''));
    }
    if (bonusPts) this.addFx(0.2, this.cols / 2 - 0.5, `❄️ +${bonusPts * this.run.multiplier * tempoMult}`, 'gold big');
    // shake from 8 cleared, intensity scales with count (board-only, CSS transform)
    if (cnt >= 8) this.doShake(Math.min(12, Math.round(cnt * 0.5)));

    return { cleared, spawns, floods, cnt, pts, maxDelay };
  }

  applyStep(res) {
    for (const { r, c } of res.cleared.values()) {
      if (!res.spawns.has(K(r, c))) this.board[r][c] = null;
    }
    for (const [k, tile] of res.spawns) {
      const [r, c] = k.split(',').map(Number);
      this.board[r][c] = tile;
      setTimeout(() => { delete tile.fresh; }, 400);
    }
    for (const f of res.floods) {
      const cands = [], seen = new Set();
      if (f.cells) { // adjacent to the matched group (Flood)
        for (const cl of f.cells) for (const [dr, dc] of DIRS4) {
          const r = cl.r + dr, c = cl.c + dc, k = K(r, c);
          if (r < 0 || r >= this.rows || c < 0 || c >= this.cols || seen.has(k)) continue;
          seen.add(k);
          const t = this.board[r][c];
          if (t && !t.pop && !t.chest && t.color !== f.color) cands.push({ r, c });
        }
      } else { // board-wide (Converter)
        // prefer targets that don't instantly complete a match — conversion
        // should set up plays, not constantly fire free cascades
        const risky = [];
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
          const t = this.board[r][c];
          if (t && !t.pop && !t.chest && t.color !== f.color) {
            (this.wouldMatchAt(r, c, f.color) ? risky : cands).push({ r, c });
          }
        }
        if (!cands.length) cands.push(...risky); // only cascade when unavoidable
      }
      if (cands.length) {
        const p = cands[Math.floor(this.rng() * cands.length)];
        const t = this.board[p.r][p.c];
        t.color = f.color;
        t.cflash = true; // bright flash marks the conversion
        setTimeout(() => { delete t.cflash; }, 600);
        this.addFx(p.r, p.c, f.cells ? '🌊' : '🔀', 'emoji');
      }
    }
  }

  // gravity-ish: longer falls take a bit more time but gain average speed
  fallDur(dist) {
    return Math.min(CONFIG.FALL_MAX_MS, Math.round(140 + Math.sqrt(Math.max(1, dist)) * 110));
  }

  async dropAndFill() {
    let any = false, maxFall = 0;
    for (let c = 0; c < this.cols; c++) {
      let write = this.rows - 1;
      for (let r = this.rows - 1; r >= 0; r--) {
        const t = this.board[r][c];
        if (t) {
          if (write !== r) {
            t.fallDist = write - r; // drives per-tile duration + bounce easing
            maxFall = Math.max(maxFall, t.fallDist);
            this.board[write][c] = t; this.board[r][c] = null; any = true;
          }
          write--;
        }
      }
      const newCount = write + 1;
      for (let r = write; r >= 0; r--) {
        let t;
        // Queued drip chests ride in as the topmost refill tile of a column.
        if (r === 0 && this.pendingChests > 0) {
          this.pendingChests--;
          t = { id: this.tileId++, color: -1, chest: true, special: null, dir: null, countdown: null };
        } else t = this.makeTile(this.rollRefillColor());
        t.enter = r - newCount; // start above the board, then fall in
        t.fallDist = newCount;
        maxFall = Math.max(maxFall, newCount);
        this.board[r][c] = t;
        any = true;
      }
    }
    if (!any) return;
    this.render(); await this.sleep(30);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const t = this.board[r][c];
      if (t && t.enter !== undefined) delete t.enter;
    }
    this.render(); await this.sleep(this.fallDur(maxFall));
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const t = this.board[r][c];
      if (t && t.fallDist !== undefined) delete t.fallDist; // back to snappy swap timing
    }

    // Treasure chests pay out when they reach the bottom row, then the column resettles.
    let collected = false;
    for (let c = 0; c < this.cols; c++) {
      const t = this.board[this.rows - 1][c];
      if (t && t.chest) {
        collected = true;
        this.board[this.rows - 1][c] = null;
        // context-sensitive: hand out moves when the player is running dry,
        // points otherwise
        if (this.movesLeft <= CONFIG.CHEST_LOW_MOVES) {
          this.movesLeft += CONFIG.CHEST_MOVES;
          this.addFx(this.rows - 1, c, `🎁 +${CONFIG.CHEST_MOVES} moves`, 'big');
        } else {
          this.score += CONFIG.CHEST_POINTS;
          this.addFx(this.rows - 1, c, `🎁 +${CONFIG.CHEST_POINTS}`, 'big');
        }
      }
    }
    if (collected) { this.render(); await this.sleep(CONFIG.POP_MS); await this.dropAndFill(); }
  }

  async resolveBoard(swapCells) {
    let cascades = 0;
    while (cascades++ < CONFIG.MAX_CASCADES) {
      const groups = this.findGroups();
      if (!groups.length) break;
      // cascades announce themselves so chains read as a building combo
      if (cascades >= CONFIG.COMBO_CALLOUT_FROM) {
        this.addFx(-0.7, this.cols / 2 - 0.5, `Combo ×${cascades}${cascades >= 4 ? ' 🔥' : ''}`, 'combo');
        if (cascades >= 3) this.doShake(4);
      }
      const res = this.processStep(groups, swapCells, []);
      swapCells = null;
      this.render(); await this.sleep(CONFIG.POP_MS + res.maxDelay);
      this.applyStep(res);
      await this.dropAndFill();
      await this.sleep(CONFIG.STEP_PAUSE);
    }
  }

  async explodeSeeds(seeds) {
    const res = this.processStep([], null, seeds);
    if (!res.cnt) return;
    this.render(); await this.sleep(CONFIG.POP_MS + res.maxDelay);
    this.applyStep(res);
    await this.dropAndFill();
    await this.resolveBoard(null);
  }

  async endOfMove() {
    if (this.mods.countdown) {
      let ticked = false;
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
        const t = this.board[r][c];
        if (t && t.special && t.countdown !== null) { t.countdown--; ticked = true; }
      }
      if (ticked) { this.render(); await this.sleep(120); }
    }
    let rounds = 0;
    while (rounds++ < CONFIG.AUTO_EXPLODE_MAX_ROUNDS) {
      const seeds = [];
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
        const t = this.board[r][c];
        if (t && t.special && (this.mods.autoExplode || (t.countdown !== null && t.countdown <= 0))) seeds.push({ r, c });
      }
      if (!seeds.length) break;
      await this.explodeSeeds(seeds);
      if (!this.mods.autoExplode) break; // countdown only ticks once per move
    }
    if (this.mods.chomper) await this.chomperMove();
    if (this.mods.conveyor) await this.rotateEdges();
    if (this.mods.lava) await this.lavaClear();
  }

  // backfill his trail with a fresh tile — leaving a hole meant gravity
  // instantly yanked him back down after any upward step
  backfillChomperTrail(r, c) {
    const back = this.makeTile(this.rollRefillColor());
    back.fresh = true;
    setTimeout(() => { delete back.fresh; }, 400);
    this.board[r][c] = back;
  }

  // Chomper: once per player move (never on cascades) each chomper steps one
  // cell in the direction of the last swap — a secret rule, no UI hints — and
  // eats whatever it lands on at full per-piece value. Board edges, chests,
  // other chompers, and marked cells are walls: it stays put that move.
  async chomperMove() {
    if (this.phase !== 'level' || !this.lastSwapDir) return;
    const chompers = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const t = this.board[r][c];
      if (t && t.chomper) chompers.push({ r, c, t });
    }
    if (!chompers.length) return;
    let moved = false;
    for (const s of chompers) {
      let nr = s.r + this.lastSwapDir.dr, nc = s.c + this.lastSwapDir.dc;
      if (CONFIG.CHOMPER_WRAP) {
        nr = (nr + this.rows) % this.rows;
        nc = (nc + this.cols) % this.cols;
      } else if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
      const k = K(nr, nc);
      if (this.marks.has(k) || this.pinatas.has(k) || this.triples.has(k)) continue;
      const prey = this.board[nr][nc];
      if (prey && (prey.chomper || prey.chest)) continue;
      s.t.chomp = true;
      const tile = s.t;
      setTimeout(() => { delete tile.chomp; this.render(); }, 500);
      if (prey && prey.special) {
        // biting a special sets it off: full explosion, chains, matryoshka,
        // aftershock — everything a normal detonation does. The chomper is
        // blast-proof and moves in afterwards (unless matryoshka left a
        // newborn special in the crater — then he stays put this move).
        const res = this.processStep([], null, [{ r: nr, c: nc }]);
        if (res.cnt) {
          this.render(); await this.sleep(CONFIG.POP_MS + res.maxDelay);
          this.applyStep(res);
        }
        if (!this.board[nr][nc]) {
          this.board[nr][nc] = s.t;
          this.backfillChomperTrail(s.r, s.c);
        }
        moved = true;
        continue;
      }
      if (prey) {
        // full per-piece value, same formula as the tile badges
        const pts = (1 + (this.mods.boosts[prey.color] || 0)) * this.run.multiplier;
        this.score += pts;
        const bonus = (this.mods.boosts[prey.color] || 0) > 0 || this.run.multiplier > 1;
        this.addFx(nr, nc, `+${pts}`, bonus ? 'gold' : '');
      }
      this.board[nr][nc] = s.t;
      this.backfillChomperTrail(s.r, s.c);
      moved = true;
    }
    if (!moved) return;
    this.render(); await this.sleep(300);
    await this.resolveBoard(null); // the backfilled tile can line up cascades
  }

  // Conveyor belt: the whole edge ring shifts one step clockwise — every piece
  // type rides it, no exclusions. Matches it lines up resolve as cascades.
  async rotateEdges() {
    if (this.phase !== 'level' || this.rows < 2 || this.cols < 2) return;
    const ring = [];
    for (let c = 0; c < this.cols; c++) ring.push([0, c]);
    for (let r = 1; r < this.rows; r++) ring.push([r, this.cols - 1]);
    for (let c = this.cols - 2; c >= 0; c--) ring.push([this.rows - 1, c]);
    for (let r = this.rows - 2; r >= 1; r--) ring.push([r, 0]);
    const tiles = ring.map(([r, c]) => this.board[r][c]);
    for (let i = 0; i < ring.length; i++) {
      const [r, c] = ring[(i + 1) % ring.length];
      this.board[r][c] = tiles[i];
    }
    this.render(); await this.sleep(260);
    await this.resolveBoard(null);
  }

  // Floor is lava: melt the whole bottom row as a board effect.
  async lavaClear() {
    if (this.phase !== 'level') return;
    const cells = [];
    for (let c = 0; c < this.cols; c++) {
      const t = this.board[this.rows - 1][c];
      if (t && !t.chest && !t.chomper) cells.push({ r: this.rows - 1, c });
    }
    if (!cells.length) return;
    const res = this.processStep([], null, [], cells);
    if (!res.cnt) return;
    this.render(); await this.sleep(CONFIG.POP_MS + res.maxDelay);
    this.applyStep(res);
    await this.dropAndFill();
    await this.resolveBoard(null);
  }

  // would recolouring (r,c) to `color` complete a straight run of 3+?
  wouldMatchAt(r, c, color) {
    const count = (dr, dc) => {
      let n = 0, rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols) {
        const t = this.board[rr][cc];
        if (!t || t.color !== color) break;
        n++; rr += dr; cc += dc;
      }
      return n;
    };
    return count(0, -1) + count(0, 1) >= 2 || count(-1, 0) + count(1, 0) >= 2;
  }

  swapTiles(a, b) {
    const t = this.board[a.r][a.c];
    this.board[a.r][a.c] = this.board[b.r][b.c];
    this.board[b.r][b.c] = t;
  }

  // orthogonal always; diagonal only with the Diagonal swap power-up
  isSwappable(a, b) {
    const dr = Math.abs(a.r - b.r), dc = Math.abs(a.c - b.c);
    return (dr + dc === 1) || (this.mods.diagSwap && dr === 1 && dc === 1);
  }

  async trySwap(a, b) {
    if (this.phase !== 'level' || this.busy) return;
    if (!this.isSwappable(a, b)) return;
    if (a.r < 0 || a.r >= this.rows || a.c < 0 || a.c >= this.cols) return;
    if (b.r < 0 || b.r >= this.rows || b.c < 0 || b.c >= this.cols) return;
    if (!this.board[a.r][a.c] || !this.board[b.r][b.c]) return;
    if (this.board[a.r][a.c].chomper || this.board[b.r][b.c].chomper) return; // chomper can't be swapped
    this.busy = true;
    this.swapTiles(a, b);
    this.render(); await this.sleep(CONFIG.SWAP_MS);

    // Merging two adjacent specials is colour-agnostic and always a legal move.
    const ta = this.board[a.r][a.c], tb = this.board[b.r][b.c]; // post-swap tiles
    const merge = !!(ta.special && tb.special);

    if (!merge && !this.findGroups().length) {
      this.swapTiles(a, b);
      this.render(); await this.sleep(CONFIG.SWAP_MS);
      // headshake: make "that swap doesn't work" legible
      const t1 = this.board[a.r][a.c], t2 = this.board[b.r][b.c];
      if (t1) t1.wiggle = true;
      if (t2) t2.wiggle = true;
      this.render();
      setTimeout(() => { if (t1) delete t1.wiggle; if (t2) delete t2.wiggle; this.render(); }, 380);
      this.busy = false;
      return;
    }

    this.movesLeft--;
    this.moveNum++;
    if (this.run.picks.some(p => p.id === 'snowball')) this.run.snowball++;
    this.lastSwapDir = { dr: b.r - a.r, dc: b.c - a.c };
    this.refund = false;
    const preMoveScore = this.score;
    if (merge) {
      this.callout('✨ Merge!');
      this.addWave(b.r, b.c, 4, 0);
      this.doShake(10);
      this.emit('onMerge', a, b);
      if (ta.special === 'arrow' && tb.special === 'arrow') {
        // Two arrows fuse into a cross at the landing cell: full row + column.
        // The cross REPLACES both arrow effects (even if both cleared the same
        // direction), so the leftover arrow is stripped rather than chained.
        tb.special = 'cross'; tb.dir = null;
        ta.special = null; ta.dir = null; ta.countdown = null;
        await this.explodeSeeds([b]);
      } else {
        // Any other pair: both pieces just activate — the sum of their parts.
        await this.explodeSeeds([a, b]);
      }
    } else {
      await this.resolveBoard([a, b]);
    }
    await this.endOfMove();
    if (this.tripleArmed) {
      this.tripleArmed = false;
      const gained = this.score - preMoveScore;
      if (gained > 0) {
        this.score += gained * (CONFIG.TRIPLE_TILE_MULT - 1);
        this.callout(`3️⃣ Move ×${CONFIG.TRIPLE_TILE_MULT}!`);
      }
    }
    if (this.refund) { this.movesLeft++; this.callout('🔄 Free move!'); }
    this.moveScores.push(this.score - preMoveScore);
    if (!this.refund) this.movesUsed++;

    if (!this.findAnyMove()) {
      this.callout('No moves — shuffling');
      await this.sleep(500);
      this.reshuffleBoard();
    }
    this.dripRolls(); // per-move spawns (marks/piñatas/triples/chest queue)
    this.checkProgress();
    this.warnLowMoves(); // after refunds/chests/lifesaver settle the real count
    this.busy = false;
    this.render();
  }

  /* ------------------------------- Juice -------------------------------- */
  addFx(r, c, text, cls = '') {
    const id = this.fxId++;
    this.fx.push({ id, r, c, text, cls });
    setTimeout(() => { this.fx = this.fx.filter(f => f.id !== id); this.render(); }, 950);
  }
  callout(text, cls = '') {
    const id = this.fxId++;
    this.callouts.push({ id, text, cls });
    this.render();
    setTimeout(() => { this.callouts = this.callouts.filter(f => f.id !== id); this.render(); }, 1500);
  }

  // loud warning each time the final-moves count drops to 3 / 2 / 1
  warnLowMoves() {
    if (this.phase !== 'level') return;
    if (this.movesLeft > 3 || this.movesLeft < 1) { if (this.movesLeft > 3) this.lastWarnedMoves = null; return; }
    if (this.movesLeft === this.lastWarnedMoves) return;
    this.lastWarnedMoves = this.movesLeft;
    this.callout(this.movesLeft === 1 ? '🚨 LAST MOVE!' : `⚠️ ${this.movesLeft} moves left`, 'danger');
  }
  doShake(ampPx = 5) {
    this.shake = ampPx; // px amplitude, fed to the CSS keyframes via --shake-amp
    setTimeout(() => { this.shake = false; this.render(); }, 320);
  }
  // cosmetic particle burst — Math.random on purpose: never touch the seeded
  // gameplay RNG for visuals, or replays desync
  addParticles(r, c, colorIdx) {
    const n = 6 + Math.floor(Math.random() * 3);
    const ids = [];
    for (let i = 0; i < n; i++) {
      const id = this.fxId++;
      ids.push(id);
      const ang = Math.random() * Math.PI * 2;
      const dist = 26 + Math.random() * 34;
      this.fx.push({ id, r, c, kind: 'part', color: colorIdx, dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist });
    }
    setTimeout(() => { this.fx = this.fx.filter(f => !ids.includes(f.id)); this.render(); }, 600);
  }
  // expanding shockwave ring, sized in cells, centred on a cell
  addWave(r, c, sizeCells, delay = 0) {
    const id = this.fxId++;
    this.fx.push({ id, r, c, kind: 'wave', size: sizeCells, delay });
    setTimeout(() => { this.fx = this.fx.filter(f => f.id !== id); this.render(); }, 800 + delay);
  }
}

/* ================================== UI ==================================== */
const h = htm.bind(React.createElement);

function useCellSize(cols) {
  const calc = () => Math.max(30, Math.min(56, Math.floor((Math.min(window.innerWidth, 520) - 28) / cols)));
  const [s, setS] = React.useState(calc);
  React.useEffect(() => {
    const f = () => setS(calc());
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [cols]);
  return s;
}

function buildChips(G) {
  const chips = [], byKey = new Map();
  for (const p of G.run.picks) {
    const def = POWERUPS[p.id];
    const k = p.id + (p.color !== undefined ? ':' + p.color : '');
    if (byKey.has(k)) byKey.get(k).count++;
    else { const ch = { key: k, def, pick: p, count: 1 }; byKey.set(k, ch); chips.push(ch); }
  }
  return chips;
}

function Toggle({ G }) {
  return h`<button className="toggle" onClick=${() => { G.opts.draftOptions = G.opts.draftOptions === 2 ? 3 : 2; G.render(); }}>
    Draft picks: <b>${G.opts.draftOptions}</b> (tap to switch)
  </button>`;
}

function ColourToggle({ G }) {
  return h`<button className="toggle" onClick=${() => { G.opts.colours = G.opts.colours === 5 ? 6 : 5; G.render(); }}>
    Colours: <b>${G.opts.colours}</b>${G.opts.colours === 6 ? h` <span className="dot bg5"></span>` : null} (tap to switch)
  </button>`;
}

function StatsPanel() {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [exported, setExported] = React.useState(false);
  const [dl, setDl] = React.useState(null);
  const [, bump] = React.useReducer(x => x + 1, 0);
  // On claude.ai the page can offer play data as a file download (much more
  // reliable than clipboard inside the artifact iframe). null = hide button.
  React.useEffect(() => {
    let live = true;
    if (window.claude && window.claude.use) {
      window.claude.use('downloads').then(ns => { if (live) setDl(ns); }).catch(() => {});
    }
    return () => { live = false; };
  }, []);
  const human = telemetryAll().filter(r => !r.fast);
  if (!human.length) return null;
  const rows = telemetrySummary();
  const [showRaw, setShowRaw] = React.useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(telemetryAll())); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch (e) { setShowRaw(true); } // clipboard blocked (e.g. embedded page) — show selectable JSON instead
  };
  const exportFile = async () => {
    try {
      await dl.save({
        filename: `match3-playdata-${new Date().toISOString().slice(0, 10)}.json`,
        data: JSON.stringify(telemetryAll()),
      });
      setExported(true); setTimeout(() => setExported(false), 2000);
    } catch (e) { /* declined / rate-limited — viewer's call, no retry */ }
  };
  return h`<div className="stats">
    <button className="toggle" onClick=${() => setOpen(!open)}>📊 Session stats — ${human.length} segments logged</button>
    ${open ? h`<div className="stats-body">
      <table>
        <thead><tr><th>Seg</th><th>plays</th><th>clear%</th><th>pts/move</th><th>avg score</th><th>target</th></tr></thead>
        <tbody>${rows.map(r => h`<tr key=${r.level}>
          <td>${r.level}</td><td>${r.plays}</td><td>${Math.round(r.clearRate * 100)}%</td>
          <td>${r.avgPtsPerMove}</td><td>${r.avgScore}</td><td>${r.target}</td>
        </tr>`)}</tbody>
      </table>
      <div className="stats-buttons">
        ${dl ? h`<button onClick=${exportFile}>${exported ? '✅ Exported' : '⬇️ Export play data'}</button>` : null}
        <button onClick=${copy}>${copied ? '✅ Copied' : 'Copy JSON'}</button>
        <button onClick=${() => { if (confirm('Clear all logged play data?')) { telemetryClear(); bump(); } }}>Clear</button>
      </div>
      ${showRaw ? h`<textarea className="rawdata" readOnly value=${JSON.stringify(telemetryAll())}
        onFocus=${e => e.target.select()} onClick=${e => e.target.select()}></textarea>` : null}
    </div>` : null}
  </div>`;
}

function MenuScreen({ G }) {
  const [seed, setSeed] = React.useState(() => String(1 + Math.floor(Math.random() * 999999999)));
  return h`<div className="screen menu">
    <h1>🏔️ Match-3 Roguelite — Ofir</h1>
    <p className="sub">One board, one bar. Six rounds ramp from 50% to full difficulty, then endless rounds rotate one power-up and raise the next target.</p>
    <div className="menu-box">
      <label>Seed <input value=${seed} onChange=${e => setSeed(e.target.value)} inputMode="numeric" /></label>
      <${Toggle} G=${G} />
      <${ColourToggle} G=${G} />
      <button className="primary" onClick=${() => G.newRun(parseInt(seed, 10) || 1)}>Start run</button>
    </div>
    <${StatsPanel} />
    <p className="hint">Swipe or tap two adjacent tiles to swap. Match 4 → ${SPECIAL_EMOJI[CONFIG.MATCH_4_SPAWNS]} arrow, 5 → ${SPECIAL_EMOJI[CONFIG.MATCH_5_SPAWNS]} lightning, L/T → ${SPECIAL_EMOJI[CONFIG.MATCH_SHAPE_SPAWNS]} bomb.</p>
  </div>`;
}

function ColorDot({ color }) {
  return h`<span className=${'dot bg' + color}></span>`;
}

function DraftScreen({ G }) {
  const chips = buildChips(G);
  const cps = G.checkpoints();
  const next = G.run.checkpointIdx < cps.length ? cps[G.run.checkpointIdx] : null;
  return h`<div className="screen draft">
    <div className="draft-head">
      <h2>Draft ${G.run.level}</h2>
      <${Toggle} G=${G} />
      <${ColourToggle} G=${G} />
    </div>
    <p className="sub">${G.board
      ? `Score ${G.score} — ${next !== null ? `next checkpoint at ${next}` : 'endless chase!'} · 👟 ${G.movesLeft} moves banked`
      : 'Pick a power-up — it lasts the whole run.'}</p>
    <div className="cards">
      ${G.offers.map((o, i) => {
        const def = POWERUPS[o.id];
        return h`<button className="card" key=${i} onClick=${() => G.pickOffer(i)}>
          <div className="card-icon">${def.icon}${o.color !== undefined ? h`<${ColorDot} color=${o.color} />` : null}</div>
          <div className="card-name">${def.name}${o.color !== undefined ? ` — ${COLOR_NAMES[o.color]}` : ''}</div>
          <div className="card-desc">${def.desc(o)}</div>
          <div className=${'card-tag ' + def.cluster}>${def.cluster}</div>
          ${def.tier === 3 ? h`<div className="card-tag legendary">⭐ legendary</div>` : null}
        </button>`;
      })}
    </div>
    ${chips.length ? h`<div className="build">
      <div className="build-title">Your build</div>
      <div className="chip-row">${chips.map(ch => h`<span className="chip" key=${ch.key} title=${ch.def.desc(ch.pick)}>
        ${ch.def.icon}${ch.pick.color !== undefined ? h`<${ColorDot} color=${ch.pick.color} />` : null}${ch.count > 1 ? h`<b>×${ch.count}</b>` : null}
      </span>`)}</div>
    </div>` : null}
    <div className="seedline">seed ${G.seed}</div>
  </div>`;
}

function Board({ G }) {
  const cell = useCellSize(G.cols);
  const [sel, setSel] = React.useState(null);
  const drag = React.useRef(null);

  const cellAt = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / cell);
    const r = Math.floor((e.clientY - rect.top) / cell);
    if (r < 0 || r >= G.rows || c < 0 || c >= G.cols) return null;
    return { r, c };
  };
  const onDown = e => {
    // a real pointer on the board means a human is playing — never leave
    // test fast-mode (skipped animations) on for them
    if (G.fast) { G.fast = false; G.render(); }
    const cl = cellAt(e);
    if (!cl) return;
    drag.current = { ...cl, x: e.clientX, y: e.clientY, fired: false };
  };
  const onMove = e => {
    const d = drag.current;
    if (!d || d.fired) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    const mag = Math.max(Math.abs(dx), Math.abs(dy));
    if (mag > cell * 0.35) {
      d.fired = true;
      let dir;
      // with Diagonal swap, a clearly diagonal drag maps to the diagonal neighbour
      if (G.mods.diagSwap && Math.min(Math.abs(dx), Math.abs(dy)) > mag * 0.55) {
        dir = [dy > 0 ? 1 : -1, dx > 0 ? 1 : -1];
      } else {
        dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? [0, 1] : [0, -1]) : (dy > 0 ? [1, 0] : [-1, 0]);
      }
      G.trySwap({ r: d.r, c: d.c }, { r: d.r + dir[0], c: d.c + dir[1] });
      setSel(null);
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.fired) return;
    if (sel && !(sel.r === d.r && sel.c === d.c) && G.isSwappable(sel, { r: d.r, c: d.c })) { G.trySwap(sel, { r: d.r, c: d.c }); setSel(null); }
    else if (sel && sel.r === d.r && sel.c === d.c) setSel(null);
    else setSel({ r: d.r, c: d.c });
  };

  const bg = [], tiles = [], fx = [];
  for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
    const cellKey = K(r, c);
    bg.push(h`<div key=${'b' + r + '_' + c}
      className=${'bgcell' + (((r + c) % 2) ? ' alt' : '') + (G.marks.has(cellKey) ? ' mark' : '') + (G.pinatas.has(cellKey) ? ' pin' : '') + (G.triples.has(cellKey) ? ' tri' : '')}
      style=${{ transform: `translate(${c * cell}px,${r * cell}px)`, width: cell + 'px', height: cell + 'px' }}>
      ${G.marks.has(cellKey) ? '🔄' : ''}
    </div>`);
    const t = G.board[r][c];
    if (!t) continue;
    const y = (t.enter !== undefined ? t.enter : r) * cell;
    const isSel = sel && sel.r === r && sel.c === c;
    const isVol = (t.volatile || 0) > (G.moveNum || 0);
    const tileStyle = { transform: `translate(${c * cell}px,${y}px)`, width: cell + 'px', height: cell + 'px' };
    // falling tiles: duration scales with drop distance, spring easing lands with a bounce
    if (t.fallDist) tileStyle.transition = `transform ${G.fallDur(t.fallDist)}ms cubic-bezier(.22,.9,.28,1.4)`;
    tiles.push(h`<div key=${t.id} className="tile" style=${tileStyle}>
      <div className=${'tin ' + (t.chomper ? 'chomper' : t.chest ? 'chest' : 'bg' + t.color) + (t.pop ? ' pop ' + (t.popKind || 'match') : '') + (isSel ? ' sel' : '') + (t.special ? ' sp' : '') + (t.fresh ? ' fresh' : '') + (isVol ? ' vol' : '') + (t.wiggle ? ' wiggle' : '') + (t.cflash ? ' cflash' : '') + (t.chomp ? ' chomping' : '')}
        style=${t.pop && t.popDelay ? { animationDelay: t.popDelay + 'ms' } : null}>
        ${t.chomper ? h`<span className="spe">😬</span>` : null}
        ${t.chest ? h`<span className="spe">🎁</span>` : null}
        ${t.special ? h`<span className="spe">${t.special === 'arrow' ? (t.dir === 'h' ? '↔️' : '↕️') : SPECIAL_EMOJI[t.special]}</span>` : null}
        ${t.countdown !== null && t.special ? h`<span className="cd">${Math.max(0, t.countdown)}</span>` : null}
        ${(() => {
          // total value per piece: base 1 + colour boost (+ Special score when
          // this piece is a special, since specials always explode when cleared)
          const val = 1 + (G.mods.boosts[t.color] || 0) + (t.special ? G.mods.specialScore : 0);
          return val > 1 ? h`<span className=${'boostbadge' + (t.special && G.mods.specialScore ? ' gold' : '')}>${val}</span>` : null;
        })()}
      </div>
    </div>`);
  }
  const cellmarks = [];
  for (const [k, left] of G.pinatas) {
    const [r, c] = k.split(',').map(Number);
    cellmarks.push(h`<div key=${'p' + k} className="cellmark pinata"
      style=${{ left: c * cell + 'px', top: r * cell + 'px' }}>🪅<b>${left}</b></div>`);
  }
  for (const k of G.triples) {
    const [r, c] = k.split(',').map(Number);
    cellmarks.push(h`<div key=${'t' + k} className="cellmark triple"
      style=${{ left: c * cell + 'px', top: r * cell + 'px' }}>×${CONFIG.TRIPLE_TILE_MULT}</div>`);
  }
  for (const f of G.fx) {
    if (f.kind === 'part') {
      fx.push(h`<div key=${'f' + f.id} className=${'particle bg' + f.color}
        style=${{ left: (f.c + 0.5) * cell + 'px', top: (f.r + 0.5) * cell + 'px', '--dx': f.dx + 'px', '--dy': f.dy + 'px' }}></div>`);
      continue;
    }
    if (f.kind === 'wave') {
      const D = f.size * cell;
      fx.push(h`<div key=${'f' + f.id} className="wavefx"
        style=${{ left: (f.c + 0.5) * cell - D / 2 + 'px', top: (f.r + 0.5) * cell - D / 2 + 'px', width: D + 'px', height: D + 'px', animationDelay: (f.delay || 0) + 'ms' }}></div>`);
      continue;
    }
    fx.push(h`<div key=${'f' + f.id} className=${'fx ' + f.cls}
      style=${{ left: (f.c + 0.5) * cell + 'px', top: (f.r + 0.4) * cell + 'px' }}>${f.text}</div>`);
  }

  return h`<div className=${'board' + (G.shake ? ' shake' : '')}
    style=${{ width: G.cols * cell + 'px', height: G.rows * cell + 'px', '--shake-amp': (G.shake || 0) + 'px' }}
    onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerLeave=${onUp}>
    ${bg}${tiles}${cellmarks}${fx}
  </div>`;
}

function PowerBar({ G }) {
  const [info, setInfo] = React.useState(null);
  const chips = buildChips(G);
  if (!chips.length) return null;
  return h`<div className="powerbar">
    ${info !== null && chips[info] ? h`<div className="chip-info">${chips[info].def.desc(chips[info].pick)}${chips[info].def.id === 'fillup' ? ` — ${G.run.fillCount - CONFIG.FILL_UP_THRESHOLD * G.run.fillTriggers}/${CONFIG.FILL_UP_THRESHOLD}` : ''}${chips[info].def.id === 'momentum' ? ` — ${G.run.momentum || 0}/${Math.max(CONFIG.MOMENTUM_MIN, CONFIG.MOMENTUM_BASE - (chips[info].count - 1))}` : ''}</div>` : null}
    <div className="chip-row">
      ${chips.map((ch, i) => h`<button key=${ch.key}
        className=${'chip' + (ch.def.id === 'lifesaver' && G.run.lifesaverUsed ? ' used' : '') + (info === i ? ' active' : '')}
        onClick=${() => setInfo(info === i ? null : i)}>
        ${ch.def.icon}${ch.pick.color !== undefined ? h`<${ColorDot} color=${ch.pick.color} />` : null}${ch.count > 1 ? h`<b>×${ch.count}</b>` : null}
      </button>`)}
    </div>
  </div>`;
}

function FillupMeter({ G }) {
  if (!G.mods.fillup) return null;
  const progress = G.run.fillCount - CONFIG.FILL_UP_THRESHOLD * G.run.fillTriggers;
  const pct = Math.min(100, Math.round((progress / CONFIG.FILL_UP_THRESHOLD) * 100));
  return h`<div className="fillmeter" title="Fill-up: boosted tiles matched toward the next multiplier">
    <span className="fill-icon">🔋</span>
    <div className="fill-bar"><div className="fill-fill" style=${{ width: pct + '%' }}></div></div>
    <span className="fill-nums">${progress}/${CONFIG.FILL_UP_THRESHOLD}</span>
    <span className="fill-mult">×${G.run.multiplier}</span>
  </div>`;
}

function MomentumMeter({ G }) {
  const picks = G.run.picks.filter(p => p.id === 'momentum').length;
  if (!picks) return null;
  const need = Math.max(CONFIG.MOMENTUM_MIN, CONFIG.MOMENTUM_BASE - (picks - 1));
  const cur = Math.min(G.run.momentum || 0, need);
  const pct = Math.min(100, Math.round((cur / need) * 100));
  return h`<div className="fillmeter" title="Momentum: 4+ matches you make charge a bonus move">
    <span className="fill-icon">🚀</span>
    <div className="fill-bar"><div className="fill-fill mfill" style=${{ width: pct + '%' }}></div></div>
    <span className="fill-nums">${cur}/${need}</span>
    <span className="fill-mult">+1 👟</span>
  </div>`;
}

function LevelScreen({ G }) {
  const cps = G.checkpoints();
  const n = cps.length;
  const idx = G.run.checkpointIdx;
  const endless = G.run.finalReached;
  const next = endless ? G.run.endlessTarget : cps[idx];
  // Equal-spaced checkpoint segments (linear score would cram the early flags
  // into the bar's first 10%); the fill interpolates within the live segment.
  const prev = endless ? next - G.run.endlessDelta : (idx > 0 ? cps[idx - 1] : 0);
  const frac = Math.max(0, Math.min(1, (G.score - prev) / (next - prev)));
  const pct = endless ? frac * 100 : Math.min(100, ((idx + frac) / n) * 100);
  const cp = G.lastCheckpoint;
  const reward = G.run.pendingRewards[0];
  return h`<div className="screen level-screen">
    <div className="hud">
      <div className="hud-lv">${endless ? `🔥 Round ${G.run.endlessRound + 1}` : `🚩 ${G.run.checkpointIdx}/${cps.length}`}</div>
      <div className="hud-score">
        <div className="bar runbar">
          <div className="fill" style=${{ width: pct + '%' }}></div>
          ${endless ? null : cps.map((v, i) => h`<div key=${i} title=${v}
            className=${'cp-tick' + (G.score >= v ? ' done' : '')}
            style=${{ left: ((i + 1) / n) * 100 + '%' }}></div>`)}
        </div>
        <div className="nums">${G.score} / ${next}${G.run.multiplier > 1 ? h`<span className="mult"> ×${G.run.multiplier}</span>` : null}</div>
      </div>
      <div className=${'hud-moves' + (G.movesLeft <= 3 ? ' low' : '')}>👟 ${G.movesLeft}</div>
      ${G.fast ? h`<button className="fastbadge" title="Animations off (test mode) — tap to restore"
        onClick=${() => { G.fast = false; G.render(); }}>⏩</button>` : null}
    </div>
    <${FillupMeter} G=${G} />
    <${MomentumMeter} G=${G} />
    <div className=${'board-wrap' + (G.phase === 'level' && G.movesLeft <= 3 && G.movesLeft >= 1 ? ' danger d' + G.movesLeft : '')}><${Board} G=${G} /></div>
    <${PowerBar} G=${G} />
    <div className="callouts">${G.callouts.map(c => h`<div key=${c.id} className=${'callout ' + (c.cls || '')}>${c.text}</div>`)}</div>
    ${G.phase === 'checkpoint' && cp ? h`<div className="overlay">
      <div className="panel">
        <h2>${cp.endlessCrossed
          ? `🔥 Endless Round ${cp.round} complete`
          : cp.finalFlag ? '🏁 Final checkpoint' : `🚩 Checkpoint ${cp.n}`}${cp.crossed > 1 ? ` (×${cp.crossed} in one move!)` : ''}</h2>
        <p>+${cp.moves} moves${cp.finalFlag ? ' — Endless Round 1 begins' : ''}</p>
        <button className="primary" onClick=${() => G.continueRun()}>${reward === 'rotate' ? 'Choose a power-up to discard' : 'Draft a power-up'}</button>
      </div>
    </div>` : null}
    ${G.phase === 'discard' ? h`<${InlineDiscard} G=${G} />` : null}
    ${G.phase === 'draft' ? h`<${InlineDraft} G=${G} />` : null}
  </div>`;
}

function InlineDiscard({ G }) {
  return h`<div className="draft-inline discard-inline">
    <div className="draft-inline-title">Endless Round ${G.run.endlessRound + 1} — discard one power-up</div>
    <div className="cards">
      ${G.discardOffers.map((o, i) => {
        const pick = o.pick, def = POWERUPS[pick.id];
        return h`<button className="card" key=${o.key} onClick=${() => G.discardOffer(i)}>
          <div className="card-icon">${def.icon}${pick.color !== undefined ? h`<${ColorDot} color=${pick.color} />` : null}${o.count > 1 ? h`<b>×${o.count}</b>` : null}</div>
          <div className="card-name">${def.name}${pick.color !== undefined ? ` — ${COLOR_NAMES[pick.color]}` : ''}</div>
          <div className="card-desc">${def.desc(pick)}</div>
          <div className="card-tag discard-tag">discard</div>
        </button>`;
      })}
    </div>
  </div>`;
}

// Mid-run draft: compact cards UNDER the board — testers pick with the board
// in view (colour counts, marks, chest positions are part of the decision).
function InlineDraft({ G }) {
  return h`<div className="draft-inline">
    <div className="draft-inline-title">${G.replacing ? `Endless Round ${G.run.endlessRound + 1} — choose a replacement` : `Draft ${G.run.level} — pick a power-up`}</div>
    <div className="cards">
      ${G.offers.map((o, i) => {
        const def = POWERUPS[o.id];
        return h`<button className="card" key=${i} onClick=${() => G.pickOffer(i)}>
          <div className="card-icon">${def.icon}${o.color !== undefined ? h`<${ColorDot} color=${o.color} />` : null}</div>
          <div className="card-name">${def.name}${o.color !== undefined ? ` — ${COLOR_NAMES[o.color]}` : ''}</div>
          <div className="card-desc">${def.desc(o)}</div>
          <div className=${'card-tag ' + def.cluster}>${def.cluster}</div>
          ${def.tier === 3 ? h`<div className="card-tag legendary">⭐ legendary</div>` : null}
        </button>`;
      })}
    </div>
  </div>`;
}

function EndScreen({ G }) {
  const win = G.phase === 'win';
  const chips = buildChips(G);
  const [copied, setCopied] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(telemetryAll())); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch (e) { setShowRaw(true); }
  };
  return h`<div className="screen end">
    <h1>${win ? '🏆 Summit reached!' : '💀 Out of moves'}</h1>
    <div className="end-stats">
      <div><b>${G.run.checkpointIdx}</b> / ${CONFIG.CHECKPOINTS.length} checkpoints crossed</div>
      ${G.run.finalReached ? h`<div><b>${G.run.endlessRound}</b> endless rounds completed</div>` : null}
      <div><b>${G.score}</b> final score</div>
      <div className="seedline">seed ${G.seed}</div>
    </div>
    ${chips.length ? h`<div className="build">
      <div className="build-title">Final build</div>
      <div className="chip-row">${chips.map(ch => h`<span className="chip" key=${ch.key} title=${ch.def.desc(ch.pick)}>
        ${ch.def.icon}${ch.pick.color !== undefined ? h`<${ColorDot} color=${ch.pick.color} />` : null}${ch.count > 1 ? h`<b>×${ch.count}</b>` : null}
      </span>`)}</div>
    </div>` : null}
    <div className="end-buttons">
      <button className="primary" onClick=${() => G.newRun(1 + Math.floor(Math.random() * 999999999))}>New run</button>
      <button onClick=${() => G.newRun(G.seed)}>Replay this seed</button>
    </div>
    <div className="end-export">
      <button onClick=${copy}>${copied ? '✅ Copied — send it to the designer!' : '📤 Copy my play data'}</button>
      ${showRaw ? h`<textarea className="rawdata" readOnly value=${JSON.stringify(telemetryAll())}
        onFocus=${e => e.target.select()} onClick=${e => e.target.select()}></textarea>` : null}
    </div>
  </div>`;
}

function App() {
  const [, force] = React.useReducer(x => x + 1, 0);
  const ref = React.useRef(null);
  if (!ref.current) {
    ref.current = new Game(() => force());
    // Debug / test handles (used by scripted verification, harmless in play)
    const G = ref.current;
    window.RL = {
      game: G, CONFIG, POWERUPS,
      telemetry: { all: telemetryAll, summary: telemetrySummary, clear: telemetryClear },
      cheat: {
        // jump the score to the next fixed or endless target
        cross() { const target = G.nextTarget(); if (target !== undefined) { G.score = target; G.checkProgress(); G.render(); } },
        win() { this.cross(); },
        addScore(n) { G.score += n; G.checkProgress(); G.render(); },
        setMoves(n) { G.movesLeft = n; G.render(); },
        pick(id, color) { G.run.picks.push(color !== undefined ? { id, color } : { id }); G.computeMods(); G.render(); },
      },
    };
  }
  const G = ref.current;
  const playing = !['menu', 'win', 'loss'].includes(G.phase);
  React.useEffect(() => {
    if (!playing) return;
    const stopBack = () => history.pushState({ match3Run: true }, '', location.href);
    stopBack();
    addEventListener('popstate', stopBack);
    return () => {
      removeEventListener('popstate', stopBack);
      if (history.state?.match3Run) history.back();
    };
  }, [playing]);
  if (G.phase === 'menu') return h`<${MenuScreen} G=${G} />`;
  // Run-start draft has no board yet → full screen. Mid-run drafts render
  // inside LevelScreen so the board stays visible (tester feedback).
  if (G.phase === 'draft' && !G.board) return h`<${DraftScreen} G=${G} />`;
  if (G.phase === 'win' || G.phase === 'loss') return h`<${EndScreen} G=${G} />`;
  return h`<${LevelScreen} G=${G} />`;
}

ReactDOM.createRoot(document.getElementById('root')).render(h`<${App} />`);

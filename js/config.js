'use strict';

const CONFIG = {
    // Canvas
    CANVAS_WIDTH:  1280,
    CANVAS_HEIGHT: 760,
    EARTH_RADIUS:  80,

    // ── Zoom ──────────────────────────────────────────────────────────────────
    ZOOM_MIN:   0.4,
    ZOOM_MAX:   2.5,
    ZOOM_STEP:  0.1,
    ZOOM_DEFAULT: 1.0,

    // ── Sub-orbit levels (1–5 altitude bands within each major orbit) ─────────
    SUB_LEVELS: 5,
    SUB_LEVEL_SPACING: 6,           // pixels between sub-levels
    RAISE_LOWER_DV_COST: 3,        // delta-V per sub-level change

    // Orbital bands — all real Earth orbit families
    ORBITS: {
        ISS:       { key: 'ISS',       radius: 110, period: 8,   name: 'ISS (~400 km)',         color: '#44aaff', moneyRate: 3,  debrisDecay: 0.00008  },
        LEO:       { key: 'LEO',       radius: 130, period: 10,  name: 'LEO (200–2000 km)',     color: '#66ccff', moneyRate: 3,  debrisDecay: 0.00006  },
        SSO:       { key: 'SSO',       radius: 145, period: 11,  name: 'SSO (~800 km)',         color: '#88ffdd', moneyRate: 4,  debrisDecay: 0.00005  },
        POLAR:     { key: 'POLAR',     radius: 155, period: 12,  name: 'Polar (~900 km)',       color: '#aaffaa', moneyRate: 4,  debrisDecay: 0.00005  },
        MEO:       { key: 'MEO',       radius: 210, period: 22,  name: 'MEO (GPS ~20 200 km)',  color: '#ffdd44', moneyRate: 6,  debrisDecay: 0.000015 },
        HEO:       { key: 'HEO',       radius: 260, period: 28,  name: 'HEO / Molniya',         color: '#ff9944', moneyRate: 8,  debrisDecay: 0.000008 },
        GEO:       { key: 'GEO',       radius: 320, period: 40,  name: 'GEO (35 786 km)',       color: '#ff44aa', moneyRate: 12, debrisDecay: 0.000002 },
        GRAVEYARD: { key: 'GRAVEYARD', radius: 340, period: 43,  name: 'Graveyard',             color: '#884466', moneyRate: 0,  debrisDecay: 0.0000005},
    },

    // ── Hohmann transfer delta-V matrix (from → to) ──────────────────────────
    // Values represent abstract delta-V cost; -1 means not directly transferable
    HOHMANN_COSTS: {
        ISS:       { LEO: 4, SSO: 6, POLAR: 7, MEO: 14, HEO: 18, GEO: 24, GRAVEYARD: 26 },
        LEO:       { ISS: 4, SSO: 5, POLAR: 6, MEO: 12, HEO: 16, GEO: 22, GRAVEYARD: 24 },
        SSO:       { ISS: 6, LEO: 5, POLAR: 3, MEO: 10, HEO: 14, GEO: 20, GRAVEYARD: 22 },
        POLAR:     { ISS: 7, LEO: 6, SSO: 3, MEO: 9,  HEO: 13, GEO: 19, GRAVEYARD: 21 },
        MEO:       { ISS: 14, LEO: 12, SSO: 10, POLAR: 9, HEO: 8, GEO: 12, GRAVEYARD: 14 },
        HEO:       { ISS: 18, LEO: 16, SSO: 14, POLAR: 13, MEO: 8, GEO: 8, GRAVEYARD: 10 },
        GEO:       { ISS: 24, LEO: 22, SSO: 20, POLAR: 19, MEO: 12, HEO: 8, GRAVEYARD: 4 },
        GRAVEYARD: { ISS: 26, LEO: 24, SSO: 22, POLAR: 21, MEO: 14, HEO: 10, GEO: 4 },
    },

    HOHMANN_TRANSFER_TIME: 6,       // seconds for transfer animation

    // ── Delta-V system ──────────────────────────────────────────────────────────
    DELTA_V_COSTS: {
        hold_station:       0,
        sector_shift:       2,
        emergency_dodge:    8,
        safe_mode:          0,
        escort_start:       3,
        intercept:          6,
        body_block:         10,
        orbit_change_minor: 12,
        orbit_change_major: 20,
        orbit_change_geo:   24,
        refuel:             2,      // cost for maintenance sat to refuel
        raise_orbit:        3,
        lower_orbit:        3,
    },

    // Continuous drain while executing a maneuver (units / second)
    DELTA_V_DRAIN: {
        intercept:  0.35,
        escort:     0.12,
        body_block: 0.60,
        refueling:  0.05,
    },

    // Warning thresholds as fraction of capacity
    DELTA_V_WARN_LOW:      0.25,
    DELTA_V_WARN_CRITICAL: 0.10,

    // Thruster classes — speedMult scales angular pursuit rate
    THRUSTER_CLASSES: {
        cold_gas:  { speedMult: 0.50, label: 'Cold Gas',  color: '#88ccff', note: 'Limited capability, small dodges only' },
        chemical:  { speedMult: 1.50, label: 'Chemical',  color: '#ffaa44', note: 'Fast burns, ideal for intercepts'      },
        electric:  { speedMult: 0.35, label: 'Electric',  color: '#44ff88', note: 'Efficient but slow repositioning'      },
    },

    // Per-satellite-type budgets & operating costs per second
    SAT_BUDGETS: {
        utility:      { deltaVCapacity: 30, thruster: 'cold_gas',  opCostPerSec: 0.10, powerDraw: 1.0 },
        rpo:          { deltaVCapacity: 60, thruster: 'chemical',  opCostPerSec: 0.20, powerDraw: 1.5 },
        relay:        { deltaVCapacity: 20, thruster: 'electric',  opCostPerSec: 0.05, powerDraw: 0.8 },
        maintenance:  { deltaVCapacity: 80, thruster: 'chemical',  opCostPerSec: 0.25, powerDraw: 2.0 },
        enemy_rpo:    { deltaVCapacity: 50, thruster: 'chemical',  opCostPerSec: 0.00, powerDraw: 0.0 },
    },

    // Maintenance satellite
    REFUEL_AMOUNT:     20,          // delta-V delivered per refueling action
    REFUEL_RANGE:      30,          // pixels — must be this close to refuel
    REFUEL_DURATION:   5,           // seconds for refueling
    MAINTENANCE_DEFEND_RADIUS: 35,  // defence proximity radius

    // Economy
    STARTING_MONEY:       400,
    MONEY_INTERVAL:       1.0,
    BANKRUPTCY_THRESHOLD: -300,

    // Launch costs
    ROCKET_COST: 200,
    PAYLOAD_COSTS: {
        utility:     100,
        rpo:         180,
        relay:       140,
        maintenance: 220,
    },

    // ── Ground station unlock thresholds (total money earned) ─────────────────
    // Launch slots: each station starts with 1 slot, gains slots at thresholds
    GROUND_STATION_UNLOCKS: [
        { threshold:     0, name: 'Kourou',           longitude: 310, launchSlots: 1 },
        { threshold:     0, name: 'Baikonur',         longitude:  63, launchSlots: 1 },
        { threshold:  5000, name: 'Cape Canaveral',   longitude: 280, launchSlots: 1 },
        { threshold: 12000, name: 'Vandenberg',       longitude: 239, launchSlots: 1 },
        { threshold: 22000, name: 'Tanegashima',      longitude: 131, launchSlots: 1 },
        { threshold: 35000, name: 'Jiuquan',          longitude: 100, launchSlots: 1 },
        { threshold: 50000, name: 'Sriharikota',      longitude:  80, launchSlots: 1 },
        { threshold: 70000, name: 'Wenchang',         longitude: 110, launchSlots: 1 },
        { threshold: 90000, name: 'Plesetsk',         longitude:  41, launchSlots: 1 },
        { threshold:120000, name: 'Mahia (NZ)',        longitude: 177, launchSlots: 1 },
    ],

    // Launch slots: additional slots granted at money thresholds
    LAUNCH_SLOT_THRESHOLDS: [8000, 20000, 45000, 80000],

    // ── Jamming ───────────────────────────────────────────────────────────────
    JAM_COST:           150,        // money cost to deploy a jammer
    JAM_DURATION:       15,         // seconds a jam lasts
    JAM_RADIUS:         120,        // pixel radius from ground station
    JAM_COOLDOWN:       45,         // seconds before same station can jam again

    // Satellite mechanics
    COLLISION_RADIUS:       12,
    APPROACH_RADIUS:        30,
    RELAY_COMMS_RADIUS:    180,
    GROUND_COMMS_HORIZON:  155,

    // Debris
    DEBRIS_INITIAL_SPREAD:        0.30,
    DEBRIS_HIT_PROBABILITY:       0.35,
    DEBRIS_PIECES_PER_COLLISION:  2,

    // Enemy spawning
    ENEMY_SPAWN_INTERVAL_INITIAL: 35,
    ENEMY_SPAWN_INTERVAL_MIN:     12,
    ENEMY_SPAWN_RAMP_RATE:        0.92,
    ENEMY_ASAT_INTERVAL:          120,
    ASAT_CHANCE:                  0.12,

    // Maneuver speeds
    ENEMY_APPROACH_SPEED:    0.006,
    FRIENDLY_MANEUVER_SPEED: 0.012,
    EVASIVE_SHIFT:           0.45,
    INTERCEPT_CLOSE_RADIUS:  25,

    // HUD
    MESSAGE_MAX:      8,
    MESSAGE_DURATION: 6,

    // Coverage overlay
    COVERAGE_OVERLAY_ALPHA: 0.10,

    // ── Sun & Power ──────────────────────────────────────────────────────────
    SUN_CYCLE_PERIOD:     120,      // seconds for a full day/night cycle (game time)
    SOLAR_PANEL_OUTPUT:   2.0,      // power units generated in sunlight
    BATTERY_CAPACITY:     10.0,     // max stored energy units
    ECLIPSE_POWER_DRAIN:  0.5,      // power drain modifier in eclipse
    LOW_POWER_THRESHOLD:  0.20,     // fraction — below this, service degrades
    NO_POWER_THRESHOLD:   0.05,     // fraction — below this, satellite goes dark
};

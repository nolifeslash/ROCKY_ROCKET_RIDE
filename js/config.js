'use strict';

const CONFIG = {
    // Canvas
    CANVAS_WIDTH:  1280,
    CANVAS_HEIGHT: 760,
    EARTH_RADIUS:  80,

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

    // ── Delta-V system ──────────────────────────────────────────────────────────
    // Abstract units (per prototype backlog spec)
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
    },

    // Continuous drain while executing a maneuver (units / second)
    DELTA_V_DRAIN: {
        intercept:  0.35,
        escort:     0.12,
        body_block: 0.60,
    },

    // Warning thresholds as fraction of capacity
    DELTA_V_WARN_LOW:      0.25,
    DELTA_V_WARN_CRITICAL: 0.10,

    // Thruster classes — speedMult scales angular pursuit rate
    THRUSTER_CLASSES: {
        cold_gas: { speedMult: 0.50, label: 'Cold Gas',  color: '#88ccff', note: 'Limited capability, small dodges only' },
        chemical:  { speedMult: 1.50, label: 'Chemical',  color: '#ffaa44', note: 'Fast burns, ideal for intercepts'      },
        electric:  { speedMult: 0.35, label: 'Electric',  color: '#44ff88', note: 'Efficient but slow repositioning'      },
    },

    // Per-satellite-type budgets & operating costs per second
    SAT_BUDGETS: {
        utility:   { deltaVCapacity: 30, thruster: 'cold_gas',  opCostPerSec: 0.10 },
        rpo:       { deltaVCapacity: 60, thruster: 'chemical',  opCostPerSec: 0.20 },
        relay:     { deltaVCapacity: 20, thruster: 'electric',  opCostPerSec: 0.05 },
        enemy_rpo: { deltaVCapacity: 50, thruster: 'chemical',  opCostPerSec: 0.00 },
    },

    // Economy
    STARTING_MONEY:       400,
    MONEY_INTERVAL:       1.0,    // economy tick seconds
    BANKRUPTCY_THRESHOLD: -300,   // game over if money drops below this

    // Launch costs
    ROCKET_COST: 200,
    PAYLOAD_COSTS: {
        utility: 100,
        rpo:     180,
        relay:   140,
    },

    // Ground station unlock thresholds (total money earned)
    // threshold: 0 → starts unlocked
    GROUND_STATION_UNLOCKS: [
        { threshold:     0, name: 'Kourou',         longitude: 310 },
        { threshold:     0, name: 'Baikonur',        longitude:  63 },
        { threshold:  5000, name: 'Cape Canaveral',  longitude: 280 },
        { threshold: 12000, name: 'Vandenberg',      longitude: 239 },
        { threshold: 22000, name: 'Tanegashima',     longitude: 131 },
        { threshold: 35000, name: 'Jiuquan',         longitude: 100 },
    ],

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

    // Maneuver speeds (radians / second base, scaled by thruster speedMult)
    ENEMY_APPROACH_SPEED:    0.006,
    FRIENDLY_MANEUVER_SPEED: 0.012,
    EVASIVE_SHIFT:           0.45,
    INTERCEPT_CLOSE_RADIUS:  25,

    // HUD
    MESSAGE_MAX:      8,
    MESSAGE_DURATION: 6,

    // Coverage overlay
    COVERAGE_OVERLAY_ALPHA: 0.10,
};

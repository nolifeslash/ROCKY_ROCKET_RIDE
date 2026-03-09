'use strict';

const CONFIG = {
    // Canvas
    CANVAS_WIDTH: 1280,
    CANVAS_HEIGHT: 760,

    // Earth (visual radius in game-world pixels)
    EARTH_RADIUS: 80,

    // Orbital bands — all real Earth orbit families represented
    // radius: display pixels from center; period: game-seconds for one orbit;
    // moneyRate: credits/second per utility-sat on this orbit
    ORBITS: {
        ISS:      { key: 'ISS',   radius: 110, period: 8,   name: 'ISS (~400 km)',        color: '#44aaff', moneyRate: 5,  debrisDecay: 0.00008 },
        LEO:      { key: 'LEO',   radius: 130, period: 10,  name: 'LEO (200–2000 km)',    color: '#66ccff', moneyRate: 8,  debrisDecay: 0.00006 },
        SSO:      { key: 'SSO',   radius: 145, period: 11,  name: 'SSO (~800 km)',        color: '#88ffdd', moneyRate: 10, debrisDecay: 0.00005 },
        POLAR:    { key: 'POLAR', radius: 155, period: 12,  name: 'Polar (~900 km)',      color: '#aaffaa', moneyRate: 9,  debrisDecay: 0.00005 },
        MEO:      { key: 'MEO',   radius: 210, period: 22,  name: 'MEO (GPS ~20 200 km)', color: '#ffdd44', moneyRate: 15, debrisDecay: 0.000015 },
        HEO:      { key: 'HEO',   radius: 260, period: 28,  name: 'HEO/Molniya',         color: '#ff9944', moneyRate: 20, debrisDecay: 0.000008 },
        GEO:      { key: 'GEO',   radius: 320, period: 40,  name: 'GEO (35 786 km)',     color: '#ff44aa', moneyRate: 30, debrisDecay: 0.000002 },
        GRAVEYARD:{ key: 'GRAVEYARD', radius: 340, period: 43, name: 'Graveyard',        color: '#884466', moneyRate: 0,  debrisDecay: 0.0000005 },
    },

    // Game balance
    STARTING_MONEY: 800,
    MONEY_INTERVAL: 1.0,           // seconds between income ticks

    ROCKET_COST: 4000,
    PAYLOAD_COSTS: {
        utility: 2000,
        rpo:     3000,
        relay:   2500,
    },

    // Ground-station unlock thresholds (total money earned)
    GROUND_STATION_UNLOCKS: [
        { threshold: 0,      name: 'Kourou',       longitude: 310 },
        { threshold: 5000,   name: 'Baikonur',     longitude:  63 },
        { threshold: 12000,  name: 'Cape Canaveral',longitude: 280 },
        { threshold: 22000,  name: 'Vandenberg',   longitude: 239 },
        { threshold: 35000,  name: 'Tanegashima',  longitude: 131 },
        { threshold: 55000,  name: 'Jiuquan',      longitude: 100 },
    ],

    // Satellite mechanics
    COLLISION_RADIUS: 12,          // px — satellites closer than this collide
    APPROACH_RADIUS: 30,           // enemy RPO-sat "danger zone" range (px)
    RELAY_COMMS_RADIUS: 180,       // relay coverage radius (px)
    GROUND_COMMS_HORIZON: 155,     // ground station line-of-sight cutoff (px from center)

    // Debris
    DEBRIS_INITIAL_SPREAD: 0.30,   // radians
    DEBRIS_HIT_PROBABILITY: 0.35,  // per pass through cloud
    DEBRIS_PIECES_PER_COLLISION: 2,// how many clouds spawned per collision

    // Enemy spawning
    ENEMY_SPAWN_INTERVAL_INITIAL: 35,  // seconds
    ENEMY_SPAWN_INTERVAL_MIN:     12,
    ENEMY_SPAWN_RAMP_RATE:        0.92, // multiplier per spawn
    ENEMY_ASAT_INTERVAL:          120,  // seconds between ASAT launches (approx)
    ASAT_CHANCE:                  0.12, // probability per enemy-spawn cycle

    // RPO-sat approach speed (radians/second gain toward target)
    ENEMY_APPROACH_SPEED:  0.006,
    FRIENDLY_MANEUVER_SPEED: 0.012,

    // Evasive maneuver shift (radians)
    EVASIVE_SHIFT: 0.45,
    INTERCEPT_CLOSE_RADIUS: 25,    // px — friendly RPO "intercept success" radius

    // HUD
    MESSAGE_MAX: 8,
    MESSAGE_DURATION: 6,           // seconds
};

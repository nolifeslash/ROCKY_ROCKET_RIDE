'use strict';

/**
 * Scenario data — each scenario defines starting assets, objectives, and loss conditions.
 */
const SCENARIOS = {

    scenario_01: {
        id:          'scenario_01',
        name:        'Scenario 1 — First Contact',
        description: 'An enemy RPO satellite is threatening your LEO constellation. Protect your utility satellites and survive for 5 minutes.',
        startMoney:  400,

        objectives: [
            {
                id:             'survive_5min',
                type:           'time_with_sats',
                timeSeconds:    300,
                minUtilitySats: 2,
                label:          'Survive 5 min with ≥2 utility sats',
            },
        ],

        lossConditions: [
            { id: 'no_utility', type: 'utility_count', threshold: 0,    label: 'All utility satellites lost' },
            { id: 'bankrupt',   type: 'money',         threshold: -300, label: 'Bankrupt'                    },
        ],

        friendlySatellites: [
            { type: 'utility', orbit: 'LEO', angle: 0              },
            { type: 'utility', orbit: 'LEO', angle: 2.094          },
            { type: 'utility', orbit: 'LEO', angle: 4.189          },
            { type: 'utility', orbit: 'SSO', angle: 1.5            },
            { type: 'rpo',     orbit: 'LEO', angle: 0.5            },
            { type: 'relay',   orbit: 'MEO', angle: 3.14           },
        ],

        enemySatellites: [
            { type: 'enemy_rpo', orbit: 'LEO', angle: 5.76 },
        ],
    },

    scenario_02: {
        id:          'scenario_02',
        name:        'Scenario 2 — Multi-Orbit Defence',
        description: 'Defend assets across LEO, MEO and GEO. Use Hohmann transfers and maintenance sats to keep your constellation alive for 8 minutes.',
        startMoney:  800,

        objectives: [
            {
                id:             'survive_8min',
                type:           'time_with_sats',
                timeSeconds:    480,
                minUtilitySats: 3,
                label:          'Survive 8 min with ≥3 utility sats',
            },
        ],

        lossConditions: [
            { id: 'no_utility', type: 'utility_count', threshold: 0,    label: 'All utility satellites lost' },
            { id: 'bankrupt',   type: 'money',         threshold: -500, label: 'Bankrupt'                    },
        ],

        friendlySatellites: [
            { type: 'utility',     orbit: 'LEO',   angle: 0      },
            { type: 'utility',     orbit: 'SSO',   angle: 1.5    },
            { type: 'utility',     orbit: 'MEO',   angle: 3.0    },
            { type: 'utility',     orbit: 'GEO',   angle: 4.5    },
            { type: 'rpo',         orbit: 'LEO',   angle: 0.5    },
            { type: 'rpo',         orbit: 'MEO',   angle: 2.5    },
            { type: 'relay',       orbit: 'MEO',   angle: 0      },
            { type: 'relay',       orbit: 'GEO',   angle: 3.14   },
            { type: 'maintenance', orbit: 'LEO',   angle: 1.0    },
        ],

        enemySatellites: [
            { type: 'enemy_rpo', orbit: 'LEO',  angle: 4.0 },
            { type: 'enemy_rpo', orbit: 'MEO',  angle: 1.0 },
        ],
    },

    scenario_03: {
        id:          'scenario_03',
        name:        'Scenario 3 — Full Spectrum',
        description: 'All orbits active. Protect assets from ISS to GEO. Use every tool: orbit transfers, jammers, maintenance, and RPO defenders.',
        startMoney:  1200,

        objectives: [
            {
                id:             'survive_10min',
                type:           'time_with_sats',
                timeSeconds:    600,
                minUtilitySats: 4,
                label:          'Survive 10 min with ≥4 utility sats',
            },
        ],

        lossConditions: [
            { id: 'no_utility', type: 'utility_count', threshold: 0,    label: 'All utility satellites lost' },
            { id: 'bankrupt',   type: 'money',         threshold: -800, label: 'Bankrupt'                    },
        ],

        friendlySatellites: [
            { type: 'utility',     orbit: 'ISS',      angle: 0      },
            { type: 'utility',     orbit: 'LEO',      angle: 1.0    },
            { type: 'utility',     orbit: 'SSO',      angle: 2.0    },
            { type: 'utility',     orbit: 'POLAR',    angle: 3.0    },
            { type: 'utility',     orbit: 'MEO',      angle: 4.0    },
            { type: 'utility',     orbit: 'GEO',      angle: 5.0    },
            { type: 'rpo',         orbit: 'LEO',      angle: 0.5    },
            { type: 'rpo',         orbit: 'SSO',      angle: 1.5    },
            { type: 'rpo',         orbit: 'MEO',      angle: 3.5    },
            { type: 'relay',       orbit: 'MEO',      angle: 0      },
            { type: 'relay',       orbit: 'GEO',      angle: 3.14   },
            { type: 'relay',       orbit: 'HEO',      angle: 1.57   },
            { type: 'maintenance', orbit: 'LEO',      angle: 0.8    },
            { type: 'maintenance', orbit: 'MEO',      angle: 2.5    },
        ],

        enemySatellites: [
            { type: 'enemy_rpo', orbit: 'LEO',   angle: 4.5 },
            { type: 'enemy_rpo', orbit: 'SSO',   angle: 0.5 },
            { type: 'enemy_rpo', orbit: 'GEO',   angle: 2.0 },
        ],
    },

    sandbox: {
        id:          'sandbox',
        name:        'Sandbox — Free Play',
        description: 'No time limit. All orbits available. Survive as long as possible.',
        startMoney:  600,
        objectives:  [],
        lossConditions: [
            { id: 'no_utility', type: 'utility_count', threshold: 0,    label: 'All utility satellites lost' },
            { id: 'bankrupt',   type: 'money',         threshold: -500, label: 'Bankrupt'                    },
        ],
        friendlySatellites: [
            { type: 'utility',     orbit: 'LEO', angle: 0      },
            { type: 'utility',     orbit: 'LEO', angle: 2.094  },
            { type: 'utility',     orbit: 'LEO', angle: 4.189  },
            { type: 'rpo',         orbit: 'LEO', angle: 0.5    },
            { type: 'relay',       orbit: 'MEO', angle: 0      },
            { type: 'maintenance', orbit: 'LEO', angle: 1.0    },
        ],
        enemySatellites: [],
    },
};

/**
 * Load a scenario into a Game instance.
 */
function loadScenario(game, scenarioId) {
    const sc = SCENARIOS[scenarioId] || SCENARIOS.scenario_01;
    game.scenario = sc;

    // Clear existing state
    game.satellites     = [];
    game.groundStations = [];
    game.debris         = [];
    game.rockets        = [];
    game.asats          = [];
    game.activeJammers  = [];
    game.money          = sc.startMoney;
    game.totalEarned    = 0;
    game.score          = 0;
    game.time           = 0;
    game.sunAngle       = 0;
    game.gameOver       = false;
    game.gameWon        = false;
    game.gameOverReason = '';

    // Ground stations with threshold=0 are always available
    let gsIdx = 0;
    while (
        gsIdx < CONFIG.GROUND_STATION_UNLOCKS.length &&
        CONFIG.GROUND_STATION_UNLOCKS[gsIdx].threshold === 0
    ) {
        const cfg = CONFIG.GROUND_STATION_UNLOCKS[gsIdx];
        game.groundStations.push(new GroundStation(cfg.name, cfg.longitude, cfg.launchSlots));
        gsIdx++;
    }
    game._gsUnlockIndex = gsIdx;

    // Friendly satellites
    for (const def of sc.friendlySatellites) {
        const orbit = CONFIG.ORBITS[def.orbit] || CONFIG.ORBITS.LEO;
        let sat;
        if      (def.type === 'utility')     sat = new UtilitySat(orbit, def.angle);
        else if (def.type === 'rpo')         sat = new RPOSat(orbit, def.angle);
        else if (def.type === 'relay')       sat = new RelaySat(orbit, def.angle);
        else if (def.type === 'maintenance') sat = new MaintenanceSat(orbit, def.angle);
        if (sat) game.satellites.push(sat);
    }

    // Enemy satellites
    for (const def of sc.enemySatellites) {
        const orbit = CONFIG.ORBITS[def.orbit] || CONFIG.ORBITS.LEO;
        const enemy = new EnemyRPOSat(orbit, def.angle);
        game.satellites.push(enemy);
    }

    // Reset internal timers
    game._moneyTimer             = 0;
    game._enemySpawnTimer        = 0;
    game._enemySpawnInterval     = CONFIG.ENEMY_SPAWN_INTERVAL_INITIAL;
    game._asatTimer              = Utils.rand(
        CONFIG.ENEMY_ASAT_INTERVAL * 0.7,
        CONFIG.ENEMY_ASAT_INTERVAL * 1.3
    );

    game.addMessage(`Scenario: ${sc.name}`, '#88ffdd');
    if (sc.objectives.length > 0) {
        game.addMessage(`Objective: ${sc.objectives[0].label}`, '#ffdd44');
    }
    game.addMessage('Protect your utility satellites!', '#44ff88');
}

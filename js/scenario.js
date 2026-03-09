'use strict';

/**
 * Scenario data — JS objects (browser-native equivalent of JSON data files).
 * Each scenario defines starting assets, objectives, and loss conditions.
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
            { type: 'utility', orbit: 'LEO', angle: 2.094          },   // 120°
            { type: 'utility', orbit: 'LEO', angle: 4.189          },   // 240°
            { type: 'utility', orbit: 'SSO', angle: 1.5            },
            { type: 'rpo',     orbit: 'LEO', angle: 0.5            },
            { type: 'relay',   orbit: 'MEO', angle: 3.14           },   // relay on opposite side
        ],

        enemySatellites: [
            // Start ~90° behind the 240° utility sat — needs time before threat arrives
            { type: 'enemy_rpo', orbit: 'LEO', angle: 5.76 },   // ≈ 330°
        ],

        // 2 ground stations from the start (threshold 0 from config handles this)
    },

    sandbox: {
        id:          'sandbox',
        name:        'Sandbox — Free Play',
        description: 'No time limit. Survive as long as possible.',
        startMoney:  600,
        objectives:  [],
        lossConditions: [
            { id: 'no_utility', type: 'utility_count', threshold: 0,    label: 'All utility satellites lost' },
            { id: 'bankrupt',   type: 'money',         threshold: -500, label: 'Bankrupt'                    },
        ],
        friendlySatellites: [
            { type: 'utility', orbit: 'LEO', angle: 0      },
            { type: 'utility', orbit: 'LEO', angle: 2.094  },
            { type: 'utility', orbit: 'LEO', angle: 4.189  },
            { type: 'rpo',     orbit: 'LEO', angle: 0.5    },
            { type: 'relay',   orbit: 'MEO', angle: 0      },
        ],
        enemySatellites: [],
    },
};

/**
 * Load a scenario into a Game instance.
 * Replaces game's satellites, ground stations, money and objectives.
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
    game.money          = sc.startMoney;
    game.totalEarned    = 0;
    game.score          = 0;
    game.time           = 0;
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
        game.groundStations.push(new GroundStation(cfg.name, cfg.longitude));
        gsIdx++;
    }
    game._gsUnlockIndex = gsIdx;

    // Friendly satellites
    for (const def of sc.friendlySatellites) {
        const orbit = CONFIG.ORBITS[def.orbit] || CONFIG.ORBITS.LEO;
        let sat;
        if      (def.type === 'utility') sat = new UtilitySat(orbit, def.angle);
        else if (def.type === 'rpo')     sat = new RPOSat(orbit, def.angle);
        else if (def.type === 'relay')   sat = new RelaySat(orbit, def.angle);
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

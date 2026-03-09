'use strict';

class Game {
    constructor() {
        this.time         = 0;       // seconds elapsed
        this.money        = CONFIG.STARTING_MONEY;
        this.totalEarned  = 0;
        this.score        = 0;
        this.paused       = false;
        this.gameOver     = false;
        this.gameWon      = false;

        // Entity collections
        this.satellites     = [];   // all Satellite instances (player + enemy)
        this.groundStations = [];
        this.debris         = [];
        this.rockets        = [];
        this.asats          = [];

        // Selection / UI state
        this.selectedSat   = null;  // currently selected satellite
        this.messages      = [];    // { text, color, expires }

        // Timers
        this._moneyTimer        = 0;
        this._enemySpawnTimer   = 0;
        this._enemySpawnInterval = CONFIG.ENEMY_SPAWN_INTERVAL_INITIAL;
        this._asatTimer         = Utils.rand(CONFIG.ENEMY_ASAT_INTERVAL * 0.6,
                                             CONFIG.ENEMY_ASAT_INTERVAL * 1.4);
        this._gsUnlockIndex     = 0;

        this._init();
    }

    // ── Initialisation ────────────────────────────────────────────────────────

    _init() {
        // First ground station (always available)
        this._unlockGroundStation(0);
        this._gsUnlockIndex = 1;

        // Starting satellite layout
        const LEO = CONFIG.ORBITS.LEO;
        const GEO = CONFIG.ORBITS.GEO;

        // 3 utility sats spread around LEO
        for (let i = 0; i < 3; i++) {
            this.satellites.push(new UtilitySat(LEO, (i * Math.PI * 2) / 3));
        }

        // 1 friendly RPO-sat
        this.satellites.push(new RPOSat(LEO, Math.PI / 6));

        // 1 relay sat in a mid orbit
        this.satellites.push(new RelaySat(CONFIG.ORBITS.MEO, 0));

        this.addMessage('Mission active. Protect your utility satellites!', '#44ff88');
    }

    // ── Main Update ───────────────────────────────────────────────────────────

    update(dt) {
        if (this.paused || this.gameOver) return;
        this.time += dt;

        // Advance satellites
        for (const sat of this.satellites) {
            if (!sat.alive) continue;
            if (sat.type === 'enemy_rpo') {
                // handled by AI below
            } else {
                sat.update(dt);
            }
            // Apply RPO-sat tasks
            if (sat.type === 'rpo' && sat.faction === 'player') {
                this._updateFriendlyRPO(sat, dt);
            }
        }

        // Enemy AI
        const enemySats = this.satellites.filter(s => s.type === 'enemy_rpo');
        AI.updateEnemySats(enemySats, this.satellites, dt);

        // ASAT missiles
        const satMap = {};
        this.satellites.forEach(s => { satMap[s.id] = s; });
        AI.updateASATs(this.asats, satMap, dt);

        // Rockets
        this._updateRockets(dt);

        // Debris
        for (const d of this.debris) d.update(dt);

        // Comms
        Comms.update(this.groundStations, this.satellites);

        // Collision / debris / damage checks
        this._checkCollisions();
        this._checkDebrisDamage();
        this._checkASATImpacts();

        // Economy
        this._updateEconomy(dt);

        // Enemy spawning
        this._updateEnemySpawning(dt);

        // Ground-station unlocks
        this._checkGSUnlocks();

        // Expire messages
        this.messages = this.messages.filter(m => m.expires > this.time);

        // Prune dead entities
        this.satellites     = this.satellites.filter(s => s.alive);
        this.debris         = this.debris.filter(d => d.alive);
        this.rockets        = this.rockets.filter(r => r.alive);
        this.asats          = this.asats.filter(a => a.alive);

        // Win / lose check
        this._checkEndConditions();
    }

    // ── Friendly RPO-Sat Behaviour ────────────────────────────────────────────

    _updateFriendlyRPO(rpo, dt) {
        if (!rpo.task) {
            rpo.mode = 'patrol';
            return;
        }

        const { type, targetId } = rpo.task;

        if (type === 'intercept') {
            const target = this.satellites.find(s => s.id === targetId && s.alive);
            if (!target) { rpo.task = null; return; }

            // Move toward enemy on same or nearest orbit — change to target's orbit
            if (rpo.orbit.key !== target.orbit.key) {
                // Transfer to target orbit (simplified: just change orbit)
                rpo.orbit = target.orbit;
                rpo.angularVelocity = Utils.angularVelocity(rpo.orbit.period);
                this.addMessage(`RPO-${rpo.id} transferring orbit to intercept.`, '#44aaff');
            }

            // Angular pursuit
            const diff = Utils.angleDiff(rpo.angle, target.angle);
            rpo.angle = Utils.normalizeAngle(
                rpo.angle + Math.sign(diff) * CONFIG.FRIENDLY_MANEUVER_SPEED * dt
            );
            rpo._updatePos();
            rpo.status = 'maneuvering';

            // Close enough to intercept?
            const d = Utils.dist(rpo.x, rpo.y, target.x, target.y);
            if (d < CONFIG.INTERCEPT_CLOSE_RADIUS) {
                this.addMessage(`RPO-${rpo.id} intercepted enemy satellite!`, '#ffdd44');
                this.score += 100;
                target.alive = false;
                rpo.task     = null;
                rpo.status   = 'nominal';
            }

        } else if (type === 'escort') {
            const escortee = this.satellites.find(s => s.id === targetId && s.alive);
            if (!escortee) { rpo.task = null; return; }

            // Match orbit and trail slightly behind escortee
            if (rpo.orbit.key !== escortee.orbit.key) {
                rpo.orbit = escortee.orbit;
                rpo.angularVelocity = Utils.angularVelocity(rpo.orbit.period);
            }
            const desired = Utils.normalizeAngle(escortee.angle - 0.18);
            const diff    = Utils.angleDiff(rpo.angle, desired);
            rpo.angle = Utils.normalizeAngle(
                rpo.angle + Math.sign(diff) * CONFIG.FRIENDLY_MANEUVER_SPEED * dt * 0.7
            );
            rpo._updatePos();
            rpo.status = 'maneuvering';

        } else if (type === 'return') {
            rpo.task   = null;
            rpo.status = 'nominal';
            rpo.mode   = 'patrol';
        }
    }

    // ── Rockets ───────────────────────────────────────────────────────────────

    _updateRockets(dt) {
        for (const r of this.rockets) {
            if (!r.alive) continue;
            r.update(dt);
            if (!r.alive) {
                // Deploy the payload
                this.satellites.push(r.payload);
                this.addMessage(`New ${r.payload.type} satellite deployed!`, '#44ff88');
            }
        }
    }

    // ── Collision Detection ───────────────────────────────────────────────────

    _checkCollisions() {
        const alive = this.satellites.filter(s => s.alive);
        for (let i = 0; i < alive.length; i++) {
            for (let j = i + 1; j < alive.length; j++) {
                const a = alive[i], b = alive[j];
                // Only care about sats on the same orbit (or very close)
                if (a.orbit.key !== b.orbit.key) continue;
                const d = Utils.dist(a.x, a.y, b.x, b.y);
                if (d < CONFIG.COLLISION_RADIUS) {
                    this._handleCollision(a, b);
                }
            }
        }
    }

    _handleCollision(a, b) {
        const orbitName = a.orbit.name;
        this.addMessage(`COLLISION on ${orbitName}! Debris field created.`, '#ff4444');

        // Create debris clouds
        for (let i = 0; i < CONFIG.DEBRIS_PIECES_PER_COLLISION; i++) {
            const angle = Utils.normalizeAngle(
                (a.angle + b.angle) / 2 + Utils.rand(-0.3, 0.3)
            );
            this.debris.push(new DebrisCloud(a.orbit, angle));
        }

        // Destroy both entities
        a.alive = false;
        b.alive = false;
        this.score -= 50;

        // Extra debris on higher orbits
        if (a.orbit.radius >= CONFIG.ORBITS.GEO.radius) {
            this.addMessage('⚠ High-altitude debris — long-lasting hazard!', '#ff8800');
        }
    }

    // ── Debris Damage ─────────────────────────────────────────────────────────

    _checkDebrisDamage() {
        for (const cloud of this.debris) {
            if (!cloud.alive) continue;
            for (const sat of this.satellites) {
                if (!sat.alive) continue;
                if (cloud.hits(sat)) {
                    if (Math.random() < CONFIG.DEBRIS_HIT_PROBABILITY * cloud.density * 0.016) {
                        sat.health -= Utils.rand(8, 20);
                        if (sat.health <= 0) {
                            sat.alive = false;
                            this.addMessage(`${sat.type} satellite destroyed by debris!`, '#ff6600');
                            // Cascade: destroyed sat creates more debris
                            this.debris.push(new DebrisCloud(sat.orbit, sat.angle));
                        }
                    }
                }
            }
        }
    }

    // ── ASAT Impacts ──────────────────────────────────────────────────────────

    _checkASATImpacts() {
        for (const m of this.asats) {
            if (!m.alive) continue;
            const target = this.satellites.find(s => s.id === m.targetId && s.alive);
            if (!target) { m.alive = false; continue; }
            const d = Utils.dist(m.x, m.y, target.x, target.y);
            if (d < CONFIG.COLLISION_RADIUS * 1.5) {
                this.addMessage(`DA-ASAT missile destroyed ${target.type} satellite!`, '#ff2222');
                // ASAT creates debris too
                this.debris.push(new DebrisCloud(target.orbit, target.angle));
                target.alive = false;
                m.alive      = false;
                this.score  -= 150;
            }
        }
    }

    // ── Economy ───────────────────────────────────────────────────────────────

    _updateEconomy(dt) {
        this._moneyTimer += dt;
        if (this._moneyTimer >= CONFIG.MONEY_INTERVAL) {
            this._moneyTimer -= CONFIG.MONEY_INTERVAL;
            const utilitySats = this.satellites.filter(
                s => s.type === 'utility' && s.alive
            );
            let income = 0;
            for (const s of utilitySats) income += s.moneyPerSecond;
            this.money       += income;
            this.totalEarned += income;
            this.score       += Math.floor(income / 10);
        }
    }

    // ── Enemy Spawning ────────────────────────────────────────────────────────

    _updateEnemySpawning(dt) {
        this._enemySpawnTimer += dt;
        if (this._enemySpawnTimer >= this._enemySpawnInterval) {
            this._enemySpawnTimer -= this._enemySpawnInterval;
            this._spawnEnemy();
            // Ramp up difficulty
            this._enemySpawnInterval = Math.max(
                CONFIG.ENEMY_SPAWN_INTERVAL_MIN,
                this._enemySpawnInterval * CONFIG.ENEMY_SPAWN_RAMP_RATE
            );
        }

        // ASAT
        this._asatTimer -= dt;
        if (this._asatTimer <= 0) {
            this._asatTimer = Utils.rand(
                CONFIG.ENEMY_ASAT_INTERVAL * 0.6,
                CONFIG.ENEMY_ASAT_INTERVAL * 1.4
            );
            if (Math.random() < CONFIG.ASAT_CHANCE) this._spawnASAT();
        }
    }

    _spawnEnemy() {
        // Pick a random orbit that has at least one utility sat
        const utilSats = this.satellites.filter(s => s.type === 'utility' && s.alive);
        if (utilSats.length === 0) return;

        const target = Utils.pick(utilSats);
        const enemy  = new EnemyRPOSat(
            target.orbit,
            Utils.normalizeAngle(target.angle + Math.PI + Utils.rand(-0.5, 0.5))
        );
        enemy.targetId = target.id;
        this.satellites.push(enemy);
        this.addMessage('⚠ Enemy RPO satellite detected!', '#ff6600');
    }

    _spawnASAT() {
        const targets = this.satellites.filter(s => s.faction === 'player' && s.alive);
        if (targets.length === 0) return;
        const target = Utils.pick(targets);
        this.asats.push(new ASATMissile(target));
        this.addMessage('🚨 DA-ASAT MISSILE LAUNCHED! Maneuver immediately!', '#ff0000');
    }

    // ── Ground Station Unlocks ────────────────────────────────────────────────

    _checkGSUnlocks() {
        const unlocks = CONFIG.GROUND_STATION_UNLOCKS;
        while (
            this._gsUnlockIndex < unlocks.length &&
            this.totalEarned >= unlocks[this._gsUnlockIndex].threshold
        ) {
            this._unlockGroundStation(this._gsUnlockIndex);
            this._gsUnlockIndex++;
        }
    }

    _unlockGroundStation(index) {
        const cfg = CONFIG.GROUND_STATION_UNLOCKS[index];
        const gs  = new GroundStation(cfg.name, cfg.longitude);
        this.groundStations.push(gs);
        if (index > 0) {
            this.addMessage(`New ground station unlocked: ${cfg.name}!`, '#aaffaa');
        }
    }

    // ── End Conditions ────────────────────────────────────────────────────────

    _checkEndConditions() {
        const util = this.satellites.filter(s => s.type === 'utility' && s.alive);
        if (util.length === 0) {
            this.gameOver = true;
            this.addMessage('GAME OVER — All utility satellites lost!', '#ff2222');
        }
    }

    // ── Public Actions (called from UI) ──────────────────────────────────────

    /**
     * Task a friendly satellite.
     * @param {Satellite} sat    — satellite to task
     * @param {string}    type   — 'intercept' | 'escort' | 'evade' | 'return'
     * @param {number}    [targetId]
     */
    taskSatellite(sat, type, targetId) {
        if (!Comms.canTask(sat)) {
            this.addMessage('Cannot task: satellite is out of comms range.', '#ffaa44');
            return false;
        }

        if (type === 'evade') {
            // Shift utility sat angle to avoid nearby threats
            sat.angle = Utils.normalizeAngle(sat.angle + CONFIG.EVASIVE_SHIFT);
            sat._updatePos();
            sat.status = 'maneuvering';
            this.addMessage(`Utility sat executing evasive maneuver.`, '#44aaff');
            return true;
        }

        if (type === 'intercept' || type === 'escort') {
            if (sat.type !== 'rpo') {
                this.addMessage('Only RPO satellites can intercept / escort.', '#ffaa44');
                return false;
            }
            sat.task   = { type, targetId };
            sat.mode   = type;
            sat.status = 'maneuvering';
            const verb = type === 'intercept' ? 'intercepting enemy' : 'escorting satellite';
            this.addMessage(`RPO-${sat.id} tasked: ${verb}.`, '#44aaff');
            return true;
        }

        if (type === 'return') {
            sat.task   = { type: 'return' };
            sat.status = 'nominal';
            return true;
        }

        return false;
    }

    /**
     * Launch a rocket from the given ground station.
     * @param {GroundStation} station
     * @param {string}        payloadType  — 'utility' | 'rpo' | 'relay'
     * @param {string}        orbitKey     — key in CONFIG.ORBITS
     */
    launchRocket(station, payloadType, orbitKey) {
        const totalCost = CONFIG.ROCKET_COST + CONFIG.PAYLOAD_COSTS[payloadType];
        if (this.money < totalCost) {
            this.addMessage(
                `Insufficient funds. Need ₡${Utils.formatMoney(totalCost)}.`, '#ffaa44'
            );
            return false;
        }

        this.money -= totalCost;
        const orbit   = CONFIG.ORBITS[orbitKey];
        const angle   = Utils.rand(0, Math.PI * 2);
        let payload;
        if (payloadType === 'utility') payload = new UtilitySat(orbit, angle);
        else if (payloadType === 'rpo') payload = new RPOSat(orbit, angle);
        else                            payload = new RelaySat(orbit, angle);

        this.rockets.push(new LaunchRocket(station, payload));
        this.addMessage(
            `Rocket launched from ${station.name} — ${payloadType} → ${orbit.name}`, '#88ffdd'
        );
        return true;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    addMessage(text, color) {
        this.messages.push({
            text,
            color: color || '#ffffff',
            expires: this.time + CONFIG.MESSAGE_DURATION,
        });
        if (this.messages.length > CONFIG.MESSAGE_MAX) {
            this.messages.shift();
        }
    }

    /** Find the satellite closest to canvas-world coords (wx, wy). */
    findSatNear(wx, wy, maxDist) {
        let best = null, bestD = maxDist;
        for (const s of this.satellites) {
            if (!s.alive) continue;
            const d = Utils.dist(wx, wy, s.x, s.y);
            if (d < bestD) { bestD = d; best = s; }
        }
        return best;
    }

    get playerSatellites() {
        return this.satellites.filter(s => s.faction === 'player' && s.alive);
    }

    get utilitySats() {
        return this.satellites.filter(s => s.type === 'utility' && s.alive);
    }

    get enemySats() {
        return this.satellites.filter(s => s.faction === 'enemy' && s.alive);
    }
}

'use strict';

class Game {
    constructor(scenarioId) {
        this.time           = 0;
        this.money          = CONFIG.STARTING_MONEY;
        this.totalEarned    = 0;
        this.score          = 0;
        this.paused         = false;
        this.gameOver       = false;
        this.gameWon        = false;
        this.gameOverReason = '';
        this.scenario       = null;

        this.satellites     = [];
        this.groundStations = [];
        this.debris         = [];
        this.rockets        = [];
        this.asats          = [];

        this.selectedSat    = null;
        this.messages       = [];

        // Overlays
        this.showCoverage   = false;
        this.showThreats    = true;

        // Timers (set by loadScenario)
        this._moneyTimer          = 0;
        this._enemySpawnTimer     = 0;
        this._enemySpawnInterval  = CONFIG.ENEMY_SPAWN_INTERVAL_INITIAL;
        this._asatTimer           = CONFIG.ENEMY_ASAT_INTERVAL;
        this._gsUnlockIndex       = 0;

        // Net income tracking for display
        this.lastNetIncome  = 0;

        loadScenario(this, scenarioId || 'scenario_01');
    }

    // ── Main Update ─────────────────────────────────────────────────────────

    update(dt) {
        if (this.paused || this.gameOver) return;
        this.time += dt;

        // ── Advance satellites ──────────────────────────────────────────────
        const enemySats = this.satellites.filter(s => s.type === 'enemy_rpo' && s.alive);
        const satMap    = {};
        this.satellites.forEach(s => { satMap[s.id] = s; });

        for (const sat of this.satellites) {
            if (!sat.alive) continue;
            if (sat.type !== 'enemy_rpo') sat.update(dt);
            if (sat.type === 'rpo' && sat.faction === 'player') this._updateFriendlyRPO(sat, dt);
            if (sat.type === 'utility') this._updateUtilityService(sat, dt);
        }

        AI.updateEnemySats(enemySats, this.satellites, dt);
        AI.updateASATs(this.asats, satMap, dt);

        for (const r of this.rockets) r.update(dt);
        for (const d of this.debris)  d.update(dt);

        // ── Comms ───────────────────────────────────────────────────────────
        Comms.update(this.groundStations, this.satellites);

        // ── Collision & damage ──────────────────────────────────────────────
        this._checkCollisions();
        this._checkDebrisDamage(dt);
        this._checkASATImpacts();
        this._checkEnemyApproachWarnings();

        // ── Deploy finished rockets ─────────────────────────────────────────
        for (const r of this.rockets) {
            if (!r.alive && r.progress >= 1 && r.payload && !r.deployed) {
                r.deployed = true;
                this.satellites.push(r.payload);
                this.addMessage(`✓ ${r.payload.type.toUpperCase()} satellite deployed on ${r.payload.orbit.name}!`, '#44ff88');
            }
        }

        // ── Economy ─────────────────────────────────────────────────────────
        this._updateEconomy(dt);

        // ── Spawning ────────────────────────────────────────────────────────
        this._updateSpawning(dt);

        // ── Ground station unlocks ──────────────────────────────────────────
        this._checkGSUnlocks();

        // ── Expire messages ─────────────────────────────────────────────────
        this.messages = this.messages.filter(m => m.expires > this.time);

        // ── Prune dead ──────────────────────────────────────────────────────
        this.satellites = this.satellites.filter(s => s.alive);
        this.debris     = this.debris.filter(d => d.alive);
        this.rockets    = this.rockets.filter(r => r.alive || !r.deployed);
        this.asats      = this.asats.filter(a => a.alive);

        // ── End conditions ──────────────────────────────────────────────────
        this._checkEndConditions();
    }

    // ── Utility Satellite Service Value ─────────────────────────────────────

    _updateUtilityService(sat, dt) {
        let target = 1.0;
        if (sat.safeMode)      target = 0.8;
        if (sat.task)          target = 0.6;   // maneuvering cuts output
        if (sat.health < 50)   target = Math.max(0.1, sat.health / 100);
        // Smooth transition
        sat.serviceValue += (target - sat.serviceValue) * Math.min(1, dt * 2);
    }

    // ── Friendly RPO Behaviour ───────────────────────────────────────────────

    _updateFriendlyRPO(rpo, dt) {
        if (!rpo.task) { rpo.status = 'nominal'; return; }

        const { type, targetId } = rpo.task;
        const drainRate = CONFIG.DELTA_V_DRAIN[type] || 0;

        // Drain delta-v while maneuvering
        if (drainRate > 0) {
            if (rpo.deltaV <= 0) {
                rpo.task   = null;
                rpo.status = 'nominal';
                this.addMessage(`RPO-${rpo.id} ran out of ΔV! Mission aborted.`, '#ff6600');
                return;
            }
            rpo.spend(drainRate * rpo.thrustMult * dt);
        }

        if (type === 'intercept') {
            const target = this.satellites.find(s => s.id === targetId && s.alive);
            if (!target) { rpo.task = null; return; }

            // Transfer to target's orbit if needed
            if (rpo.orbit.key !== target.orbit.key) {
                rpo.orbit = target.orbit;
                rpo.angularVelocity = Utils.angularVelocity(rpo.orbit.period);
            }
            const diff = Utils.angleDiff(rpo.angle, target.angle);
            rpo.angle = Utils.normalizeAngle(
                rpo.angle + Math.sign(diff) * CONFIG.FRIENDLY_MANEUVER_SPEED * rpo.thrustMult * dt
            );
            rpo._updatePos();
            rpo.status = 'maneuvering';

            if (Utils.dist(rpo.x, rpo.y, target.x, target.y) < CONFIG.INTERCEPT_CLOSE_RADIUS) {
                this.addMessage(`✓ RPO-${rpo.id} neutralised enemy satellite!`, '#ffdd44');
                this.score += 150;
                target.alive = false;
                rpo.task     = null;
                rpo.status   = 'nominal';
            }

        } else if (type === 'escort') {
            const escortee = this.satellites.find(s => s.id === targetId && s.alive);
            if (!escortee) { rpo.task = null; return; }

            if (rpo.orbit.key !== escortee.orbit.key) {
                rpo.orbit = escortee.orbit;
                rpo.angularVelocity = Utils.angularVelocity(rpo.orbit.period);
            }
            escortee.escortedById = rpo.id;

            // Trail 15° behind escortee
            const desired = Utils.normalizeAngle(escortee.angle - 0.26);
            const diff    = Utils.angleDiff(rpo.angle, desired);
            rpo.angle = Utils.normalizeAngle(
                rpo.angle + Math.sign(diff) * CONFIG.FRIENDLY_MANEUVER_SPEED * rpo.thrustMult * dt * 0.6
            );
            rpo._updatePos();
            rpo.status = 'maneuvering';

        } else if (type === 'body_block') {
            // Position between enemy and escortee
            const target = this.satellites.find(s => s.id === targetId && s.alive);
            if (!target) { rpo.task = null; return; }
            if (rpo.orbit.key !== target.orbit.key) {
                rpo.orbit = target.orbit;
                rpo.angularVelocity = Utils.angularVelocity(rpo.orbit.period);
            }
            const diff = Utils.angleDiff(rpo.angle, target.angle);
            rpo.angle = Utils.normalizeAngle(
                rpo.angle + Math.sign(diff) * CONFIG.FRIENDLY_MANEUVER_SPEED * rpo.thrustMult * dt * 1.2
            );
            rpo._updatePos();
            rpo.status = 'maneuvering';
        }
    }

    // ── Economy ──────────────────────────────────────────────────────────────

    _updateEconomy(dt) {
        this._moneyTimer += dt;
        if (this._moneyTimer < CONFIG.MONEY_INTERVAL) return;
        this._moneyTimer -= CONFIG.MONEY_INTERVAL;

        let income = 0, opCosts = 0;

        for (const s of this.satellites) {
            if (!s.alive) continue;
            if (s.type === 'utility' && s.faction === 'player') {
                income += s.moneyPerSecond * s.serviceValue * CONFIG.MONEY_INTERVAL;
            }
            if (s.faction === 'player') {
                opCosts += s.opCostPerSec * CONFIG.MONEY_INTERVAL;
            }
        }

        const net = income - opCosts;
        this.money       += net;
        this.totalEarned += Math.max(0, income);
        this.score       += Math.floor(Math.max(0, net) / 5);
        this.lastNetIncome = net / CONFIG.MONEY_INTERVAL;  // per-second rate for display
    }

    // ── Collision Detection ──────────────────────────────────────────────────

    _checkCollisions() {
        const alive = this.satellites.filter(s => s.alive);
        for (let i = 0; i < alive.length; i++) {
            for (let j = i + 1; j < alive.length; j++) {
                const a = alive[i], b = alive[j];
                if (a.orbit.key !== b.orbit.key) continue;
                if (Utils.dist(a.x, a.y, b.x, b.y) < CONFIG.COLLISION_RADIUS) {
                    this._handleCollision(a, b);
                }
            }
        }
    }

    _handleCollision(a, b) {
        const orbitName = a.orbit.name;
        this.addMessage(`💥 COLLISION on ${orbitName}!`, '#ff2222');
        this.score -= 80;

        for (let i = 0; i < CONFIG.DEBRIS_PIECES_PER_COLLISION; i++) {
            const ang = Utils.normalizeAngle((a.angle + b.angle) / 2 + Utils.rand(-0.3, 0.3));
            this.debris.push(new DebrisCloud(a.orbit, ang));
        }

        a.alive = false;
        b.alive = false;

        // Auto-pause on collision
        if (!this.paused) {
            this.paused = true;
            this.addMessage('⏸ Auto-paused — press Space to resume.', '#ffdd44');
        }

        if (a.orbit.radius >= CONFIG.ORBITS.GEO.radius) {
            this.addMessage('⚠ High-altitude debris — very slow decay!', '#ff8800');
        }
    }

    // ── Debris Damage ────────────────────────────────────────────────────────

    _checkDebrisDamage(dt) {
        for (const cloud of this.debris) {
            if (!cloud.alive) continue;
            for (const sat of this.satellites) {
                if (!sat.alive) continue;
                if (!cloud.hits(sat)) continue;
                const hitChance = CONFIG.DEBRIS_HIT_PROBABILITY * cloud.density * dt * 0.5;
                if (Math.random() < hitChance) {
                    const dmg = Utils.rand(5, 20);
                    sat.health -= dmg;
                    if (sat.faction === 'player') {
                        this.addMessage(`⚠ Debris hit ${sat.type}-${sat.id} (−${Math.floor(dmg)} HP)`, '#ff8800');
                    }
                    if (sat.health <= 0) {
                        sat.alive = false;
                        // Cascade: destroyed sat adds more debris
                        this.debris.push(new DebrisCloud(sat.orbit, sat.angle));
                        if (sat.faction === 'player') {
                            this.addMessage(`💀 ${sat.type.toUpperCase()}-${sat.id} destroyed by debris cascade!`, '#ff4444');
                        }
                    }
                }
            }
        }
    }

    // ── ASAT Impacts ─────────────────────────────────────────────────────────

    _checkASATImpacts() {
        const satMap = {};
        this.satellites.forEach(s => { satMap[s.id] = s; });
        for (const m of this.asats) {
            if (!m.alive) continue;
            const t = satMap[m.targetId];
            if (!t || !t.alive) { m.alive = false; continue; }
            if (Utils.dist(m.x, m.y, t.x, t.y) < CONFIG.COLLISION_RADIUS * 1.8) {
                this.addMessage(`🚀 DA-ASAT destroyed ${t.type.toUpperCase()}-${t.id}!`, '#ff0000');
                this.debris.push(new DebrisCloud(t.orbit, t.angle));
                t.alive  = false;
                m.alive  = false;
                this.score -= 200;
                if (!this.paused) {
                    this.paused = true;
                    this.addMessage('⏸ Auto-paused — press Space to resume.', '#ffdd44');
                }
            }
        }
    }

    // ── Approach Warnings ────────────────────────────────────────────────────

    _checkEnemyApproachWarnings() {
        for (const enemy of this.satellites.filter(s => s.type === 'enemy_rpo' && s.alive)) {
            const target = this.satellites.find(s => s.id === enemy.targetId && s.alive);
            if (!target) continue;
            const d = Utils.dist(enemy.x, enemy.y, target.x, target.y);
            if (d < CONFIG.APPROACH_RADIUS && !enemy._warnedApproach) {
                enemy._warnedApproach = true;
                this.addMessage(`⚠ Enemy RPO approaching SAT-${target.id} — act now!`, '#ffaa00');
            }
            if (d >= CONFIG.APPROACH_RADIUS) enemy._warnedApproach = false;
        }
    }

    // ── Enemy Spawning ────────────────────────────────────────────────────────

    _updateSpawning(dt) {
        this._enemySpawnTimer += dt;
        if (this._enemySpawnTimer >= this._enemySpawnInterval) {
            this._enemySpawnTimer  = 0;
            this._enemySpawnInterval = Math.max(
                CONFIG.ENEMY_SPAWN_INTERVAL_MIN,
                this._enemySpawnInterval * CONFIG.ENEMY_SPAWN_RAMP_RATE
            );
            this._spawnEnemy();
        }

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
        const util = this.satellites.filter(s => s.type === 'utility' && s.alive);
        if (util.length === 0) return;
        const target = Utils.pick(util);
        const enemy  = new EnemyRPOSat(
            target.orbit,
            Utils.normalizeAngle(target.angle + Math.PI + Utils.rand(-0.6, 0.6))
        );
        enemy.targetId = target.id;
        this.satellites.push(enemy);
        this.addMessage('⚠ New enemy RPO satellite detected!', '#ff6600');
    }

    _spawnASAT() {
        const targets = this.satellites.filter(s => s.faction === 'player' && s.alive);
        if (targets.length === 0) return;
        const t = Utils.pick(targets);
        this.asats.push(new ASATMissile(t));
        this.addMessage('🚨 DA-ASAT MISSILE INCOMING! Maneuver immediately!', '#ff0000');
        if (!this.paused) {
            this.paused = true;
            this.addMessage('⏸ Auto-paused — press Space to resume.', '#ffdd44');
        }
    }

    // ── Ground Station Unlocks ────────────────────────────────────────────────

    _checkGSUnlocks() {
        const unlocks = CONFIG.GROUND_STATION_UNLOCKS;
        while (
            this._gsUnlockIndex < unlocks.length &&
            this.totalEarned >= unlocks[this._gsUnlockIndex].threshold
        ) {
            const cfg = CONFIG.GROUND_STATION_UNLOCKS[this._gsUnlockIndex];
            this.groundStations.push(new GroundStation(cfg.name, cfg.longitude));
            this.addMessage(`📡 Ground station unlocked: ${cfg.name}`, '#aaffaa');
            this._gsUnlockIndex++;
        }
    }

    // ── End Conditions ────────────────────────────────────────────────────────

    _checkEndConditions() {
        const util = this.satellites.filter(s => s.type === 'utility' && s.alive);

        // Loss checks
        if (util.length === 0) {
            this.gameOver       = true;
            this.gameOverReason = 'All utility satellites lost!';
            return;
        }
        if (this.money < CONFIG.BANKRUPTCY_THRESHOLD) {
            this.gameOver       = true;
            this.gameOverReason = 'Bankrupt — programme cancelled!';
            return;
        }

        // Win checks (scenario objectives)
        if (!this.scenario) return;
        for (const obj of this.scenario.objectives) {
            if (obj.type === 'time_with_sats') {
                if (this.time >= obj.timeSeconds && util.length >= obj.minUtilitySats) {
                    this.gameOver       = true;
                    this.gameWon        = true;
                    this.gameOverReason = `Mission complete — ${obj.label}`;
                }
            }
        }
    }

    // ── Public: Task a Satellite ──────────────────────────────────────────────

    taskSatellite(sat, type, targetId) {
        if (!Comms.canTask(sat)) {
            this.addMessage('Cannot task: satellite is out of comms range.', '#ffaa44');
            return false;
        }

        const cost = CONFIG.DELTA_V_COSTS[type] || 0;
        if (!sat.canAfford(cost)) {
            this.addMessage(
                `Cannot execute: insufficient ΔV — need ${cost}, have ${Math.floor(sat.deltaV)}.`,
                '#ff8800'
            );
            return false;
        }

        if (type === 'emergency_dodge') {
            sat.spend(cost);
            sat.angle = Utils.normalizeAngle(sat.angle + CONFIG.EVASIVE_SHIFT);
            sat._updatePos();
            sat.status = 'maneuvering';
            sat.maneuverCooldown = 8;
            this.addMessage(`SAT-${sat.id} executing emergency dodge. (ΔV −${cost})`, '#44aaff');
            return true;
        }

        if (type === 'safe_mode') {
            sat.safeMode = !sat.safeMode;
            const msg = sat.safeMode ? 'Safe mode ON (−20% income, better survivability)' : 'Safe mode OFF';
            this.addMessage(`SAT-${sat.id}: ${msg}`, '#88ccff');
            return true;
        }

        if (type === 'intercept' || type === 'escort' || type === 'body_block') {
            if (sat.type !== 'rpo') {
                this.addMessage('Only RPO satellites can intercept / escort.', '#ffaa44');
                return false;
            }
            sat.spend(cost);
            sat.task   = { type, targetId };
            sat.mode   = type;
            sat.status = 'maneuvering';
            const desc = type === 'intercept' ? `intercepting enemy-${targetId}`
                        : type === 'escort'    ? `escorting SAT-${targetId}`
                        :                        `body-blocking enemy-${targetId}`;
            this.addMessage(`RPO-${sat.id} tasked: ${desc}. (ΔV −${cost})`, '#44aaff');
            return true;
        }

        if (type === 'return') {
            // Clear escort link
            if (sat.task && sat.task.type === 'escort') {
                const escortee = this.satellites.find(s => s.id === sat.task.targetId);
                if (escortee) escortee.escortedById = null;
            }
            sat.task   = null;
            sat.status = 'nominal';
            sat.mode   = 'patrol';
            this.addMessage(`RPO-${sat.id} returned to patrol.`, '#88ccff');
            return true;
        }

        return false;
    }

    // ── Public: Launch Rocket ─────────────────────────────────────────────────

    launchRocket(station, payloadType, orbitKey) {
        const cost = CONFIG.ROCKET_COST + CONFIG.PAYLOAD_COSTS[payloadType];
        if (this.money < cost) {
            this.addMessage(`Insufficient funds — need ₡${Utils.formatMoney(cost)}.`, '#ffaa44');
            return false;
        }
        this.money -= cost;

        const orbit = CONFIG.ORBITS[orbitKey];
        const angle = Utils.rand(0, Math.PI * 2);
        let payload;
        if      (payloadType === 'utility') payload = new UtilitySat(orbit, angle);
        else if (payloadType === 'rpo')     payload = new RPOSat(orbit, angle);
        else                                payload = new RelaySat(orbit, angle);

        this.rockets.push(new LaunchRocket(station, payload));
        this.addMessage(
            `🚀 Launch from ${station.name}: ${payloadType} → ${orbit.name} (₡${Utils.formatMoney(cost)})`,
            '#88ffdd'
        );
        return true;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    addMessage(text, color) {
        this.messages.push({ text, color: color || '#ffffff', expires: this.time + CONFIG.MESSAGE_DURATION });
        if (this.messages.length > CONFIG.MESSAGE_MAX) this.messages.shift();
    }

    findSatNear(wx, wy, maxDist) {
        let best = null, bestD = maxDist;
        for (const s of this.satellites) {
            if (!s.alive) continue;
            const d = Utils.dist(wx, wy, s.x, s.y);
            if (d < bestD) { bestD = d; best = s; }
        }
        return best;
    }

    get playerSatellites() { return this.satellites.filter(s => s.faction === 'player' && s.alive); }
    get utilitySats()       { return this.satellites.filter(s => s.type === 'utility' && s.alive); }
    get enemySats()         { return this.satellites.filter(s => s.faction === 'enemy' && s.alive); }
}

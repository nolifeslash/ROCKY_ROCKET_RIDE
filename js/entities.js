'use strict';

// ─── Base Entity ────────────────────────────────────────────────────────────

class Entity {
    constructor(type) {
        this.id   = Utils.uid();
        this.type = type;  // 'utility' | 'rpo' | 'relay' | 'enemy_rpo' | 'asat' | 'rocket' | 'debris' | 'groundstation'
        this.x    = 0;
        this.y    = 0;
    }
}

// ─── Ground Station ──────────────────────────────────────────────────────────

class GroundStation extends Entity {
    /**
     * @param {string} name
     * @param {number} longitude  degrees (0–360, east-positive)
     */
    constructor(name, longitude) {
        super('groundstation');
        this.name      = name;
        this.longitude = longitude;            // store for reference
        this.angle     = Utils.deg2rad(longitude);
        this.active    = true;
        this._updatePos();
    }

    _updatePos() {
        const r = CONFIG.EARTH_RADIUS;
        this.x = Math.cos(this.angle) * r;
        this.y = Math.sin(this.angle) * r;
    }

    /** Coverage horizon as a distance from origin (ground station line-of-sight) */
    get horizonRadius() { return CONFIG.GROUND_COMMS_HORIZON; }
}

// ─── Base Satellite ──────────────────────────────────────────────────────────

class Satellite extends Entity {
    /**
     * @param {object} orbit   — orbit descriptor from CONFIG.ORBITS
     * @param {number} angle   — initial angle (radians)
     * @param {string} faction — 'player' | 'enemy'
     */
    constructor(type, orbit, angle, faction) {
        super(type);
        this.orbit   = orbit;
        this.angle   = Utils.normalizeAngle(angle);
        this.faction = faction;           // 'player' | 'enemy'
        this.health  = 100;
        this.alive   = true;
        this.inComms = false;             // set each frame by comms.js
        this.task    = null;              // current task descriptor
        this.status  = 'nominal';         // 'nominal' | 'maneuvering' | 'damaged'
        this.angularVelocity = Utils.angularVelocity(orbit.period);
        this._updatePos();
    }

    _updatePos() {
        const p = Utils.orbitPos(this.orbit.radius, this.angle);
        this.x = p.x;
        this.y = p.y;
    }

    update(dt) {
        // Advance along orbit
        this.angle = Utils.normalizeAngle(this.angle + this.angularVelocity * dt);
        this._updatePos();
    }
}

// ─── Utility Satellite ───────────────────────────────────────────────────────

class UtilitySat extends Satellite {
    constructor(orbit, angle) {
        super('utility', orbit, angle, 'player');
        this.moneyPerSecond = orbit.moneyRate;
        this.escortedBy     = null;    // friendly RPO-sat id providing escort
    }
}

// ─── Friendly RPO Satellite ──────────────────────────────────────────────────

class RPOSat extends Satellite {
    constructor(orbit, angle) {
        super('rpo', orbit, angle, 'player');
        this.mode       = 'patrol';    // 'patrol' | 'intercept' | 'escort' | 'return'
        this.targetId   = null;        // enemy RPO-sat (or utility sat to escort)
        this.escorteeId = null;        // utility sat being escorted
    }
}

// ─── Relay Satellite ─────────────────────────────────────────────────────────

class RelaySat extends Satellite {
    constructor(orbit, angle) {
        super('relay', orbit, angle, 'player');
        this.commsRadius = CONFIG.RELAY_COMMS_RADIUS;
    }
}

// ─── Enemy RPO Satellite ─────────────────────────────────────────────────────

class EnemyRPOSat extends Satellite {
    constructor(orbit, angle) {
        super('enemy_rpo', orbit, angle, 'enemy');
        this.targetId   = null;        // player utility sat being pursued
        this.mode       = 'approach';  // 'approach' | 'orbit' | 'retreat'
    }

    update(dt, targetSat) {
        if (!this.alive) return;

        if (targetSat && targetSat.alive) {
            // Same orbit: close the angular gap
            if (this.orbit.key === targetSat.orbit.key) {
                const diff = Utils.angleDiff(this.angle, targetSat.angle);
                const step = CONFIG.ENEMY_APPROACH_SPEED * dt;
                this.angle = Utils.normalizeAngle(this.angle + Math.sign(diff) * step);
            } else {
                // Different orbit: drift on own orbit
                this.angle = Utils.normalizeAngle(
                    this.angle + this.angularVelocity * dt
                );
            }
        } else {
            this.angle = Utils.normalizeAngle(
                this.angle + this.angularVelocity * dt
            );
        }
        this._updatePos();
    }
}

// ─── ASAT Missile ────────────────────────────────────────────────────────────

class ASATMissile extends Entity {
    constructor(targetSat) {
        super('asat');
        this.targetId = targetSat.id;
        // Spawn off-screen in a random direction
        const spawnAngle = Math.random() * Math.PI * 2;
        const spawnDist  = CONFIG.EARTH_RADIUS * 5;
        this.x       = Math.cos(spawnAngle) * spawnDist;
        this.y       = Math.sin(spawnAngle) * spawnDist;
        this.speed   = 90;    // px / second — fast missile
        this.alive   = true;
        this.warned  = false;
    }

    update(dt, targetSat) {
        if (!this.alive || !targetSat || !targetSat.alive) {
            this.alive = false;
            return;
        }
        const dx = targetSat.x - this.x;
        const dy = targetSat.y - this.y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 1) { this.alive = false; return; }
        this.x += (dx / d) * this.speed * dt;
        this.y += (dy / d) * this.speed * dt;
    }
}

// ─── Launch Rocket ───────────────────────────────────────────────────────────

class LaunchRocket extends Entity {
    /**
     * @param {GroundStation} station
     * @param {Satellite}     payload  — satellite to deploy (not yet in main list)
     */
    constructor(station, payload) {
        super('rocket');
        this.stationId  = station.id;
        this.x          = station.x;
        this.y          = station.y;
        this.payload    = payload;
        this.progress   = 0;           // 0 → 1 (launch to deploy)
        this.alive      = true;
        // Flight duration: proportional to orbit altitude
        this.duration   = 4 + payload.orbit.radius / 40;
        this.elapsed    = 0;
        // Start and end positions
        this.startX     = station.x;
        this.startY     = station.y;
    }

    update(dt) {
        if (!this.alive) return;
        this.elapsed  += dt;
        this.progress  = Math.min(1, this.elapsed / this.duration);
        // Interpolate toward target orbit position
        const target = Utils.orbitPos(this.payload.orbit.radius, this.payload.angle);
        this.x = Utils.lerp(this.startX, target.x, this.progress);
        this.y = Utils.lerp(this.startY, target.y, this.progress);
        if (this.progress >= 1) this.alive = false;
    }
}

// ─── Debris Cloud ────────────────────────────────────────────────────────────

class DebrisCloud extends Entity {
    constructor(orbit, angle) {
        super('debris');
        this.orbit   = orbit;
        this.angle   = Utils.normalizeAngle(angle);
        this.spread  = CONFIG.DEBRIS_INITIAL_SPREAD;   // radians half-width
        this.density = 1.0;
        this.alive   = true;
        this.angularVelocity = Utils.angularVelocity(orbit.period);
        this._updatePos();
    }

    _updatePos() {
        const p = Utils.orbitPos(this.orbit.radius, this.angle);
        this.x = p.x;
        this.y = p.y;
    }

    update(dt) {
        if (!this.alive) return;
        this.angle = Utils.normalizeAngle(this.angle + this.angularVelocity * dt);
        // Spread widens slightly over time (cloud disperses)
        this.spread  += 0.002 * dt;
        this.density -= this.orbit.debrisDecay * dt;
        if (this.density <= 0) { this.density = 0; this.alive = false; }
        this._updatePos();
    }

    /** Returns true if satellite at given angle on same orbit is inside this cloud */
    hits(satellite) {
        if (satellite.orbit.key !== this.orbit.key) return false;
        const d = Math.abs(Utils.angleDiff(this.angle, satellite.angle));
        return d < this.spread;
    }
}

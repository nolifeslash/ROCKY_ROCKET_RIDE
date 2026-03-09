'use strict';

// ─── Base Entity ─────────────────────────────────────────────────────────────

class Entity {
    constructor(type) {
        this.id   = Utils.uid();
        this.type = type;
        this.x    = 0;
        this.y    = 0;
    }
}

// ─── Ground Station ──────────────────────────────────────────────────────────

class GroundStation extends Entity {
    constructor(name, longitude, launchSlots) {
        super('groundstation');
        this.name       = name;
        this.longitude  = longitude;
        this.angle      = Utils.deg2rad(longitude);
        this.active     = true;
        this.launchSlots    = launchSlots || 1;
        this.maxLaunchSlots = launchSlots || 1;
        this.slotCooldowns  = [];       // array of remaining cooldown timers
        // Jamming
        this.jamActive      = false;
        this.jamTimer       = 0;
        this.jamCooldown    = 0;
        this._updatePos();
    }
    _updatePos() {
        this.x = Math.cos(this.angle) * CONFIG.EARTH_RADIUS;
        this.y = Math.sin(this.angle) * CONFIG.EARTH_RADIUS;
    }
    update(dt) {
        // Jam timer
        if (this.jamActive) {
            this.jamTimer -= dt;
            if (this.jamTimer <= 0) {
                this.jamActive = false;
                this.jamTimer  = 0;
            }
        }
        if (this.jamCooldown > 0) this.jamCooldown -= dt;
        // Slot cooldowns
        for (let i = 0; i < this.slotCooldowns.length; i++) {
            if (this.slotCooldowns[i] > 0) this.slotCooldowns[i] -= dt;
        }
    }
    get availableSlots() {
        let used = this.slotCooldowns.filter(c => c > 0).length;
        return Math.max(0, this.launchSlots - used);
    }
    useSlot(cooldown) {
        this.slotCooldowns.push(cooldown || 30);
    }
}

// ─── Base Satellite ───────────────────────────────────────────────────────────

class Satellite extends Entity {
    constructor(type, orbit, angle, faction) {
        super(type);
        this.orbit    = orbit;
        this.angle    = Utils.normalizeAngle(angle);
        this.faction  = faction;
        this.health   = 100;
        this.alive    = true;
        this.inComms  = false;
        this.task     = null;
        this.status   = 'nominal';
        this.angularVelocity = Utils.angularVelocity(orbit.period);

        // ── Sub-orbit level (1–5, default 3 = middle) ──────────────────────
        this.subLevel = 3;

        // ── Delta-V / fuel budget ──────────────────────────────────────────
        const spec = CONFIG.SAT_BUDGETS[type] || CONFIG.SAT_BUDGETS.utility;
        this.deltaVCapacity  = spec.deltaVCapacity;
        this.deltaV          = spec.deltaVCapacity;
        this.fuelUnits       = spec.deltaVCapacity;
        this.thrusterClass   = spec.thruster;
        this.opCostPerSec    = spec.opCostPerSec;
        this.maneuverCooldown = 0;

        // ── Power / electricity ─────────────────────────────────────────────
        this.powerDraw       = spec.powerDraw || 1.0;
        this.battery         = CONFIG.BATTERY_CAPACITY;
        this.batteryCapacity = CONFIG.BATTERY_CAPACITY;
        this.inSunlight      = true;
        this.lowPower        = false;
        this.noPower         = false;

        // Service value: income multiplier (1 = full, <1 = degraded)
        this.serviceValue    = 1.0;

        // ── Orbit transfer state ────────────────────────────────────────────
        this.transferring     = false;
        this.transferTarget   = null;   // orbit object
        this.transferProgress = 0;
        this.transferDuration = 0;
        this.transferFromOrbit = null;

        this._updatePos();
    }

    get effectiveRadius() {
        const offset = (this.subLevel - 3) * CONFIG.SUB_LEVEL_SPACING;
        return this.orbit.radius + offset;
    }

    _updatePos() {
        const r = this.effectiveRadius;
        this.x = Math.cos(this.angle) * r;
        this.y = Math.sin(this.angle) * r;
    }

    update(dt) {
        // Orbit transfer animation
        if (this.transferring) {
            this.transferProgress += dt / this.transferDuration;
            if (this.transferProgress >= 1) {
                this.transferProgress = 1;
                this.orbit = this.transferTarget;
                this.angularVelocity = Utils.angularVelocity(this.orbit.period);
                this.transferring = false;
                this.transferTarget = null;
                this.transferFromOrbit = null;
                this.subLevel = 3;
            }
            this.angle = Utils.normalizeAngle(this.angle + this.angularVelocity * dt);
            this._updateTransferPos();
            if (this.maneuverCooldown > 0) this.maneuverCooldown -= dt;
            return;
        }

        this.angle = Utils.normalizeAngle(this.angle + this.angularVelocity * dt);
        this._updatePos();
        if (this.maneuverCooldown > 0) this.maneuverCooldown -= dt;
    }

    _updateTransferPos() {
        if (!this.transferFromOrbit || !this.transferTarget) {
            this._updatePos();
            return;
        }
        const fromR = this.transferFromOrbit.radius;
        const toR   = this.transferTarget.radius;
        const r = Utils.lerp(fromR, toR, this.transferProgress);
        this.x = Math.cos(this.angle) * r;
        this.y = Math.sin(this.angle) * r;
    }

    // ── Delta-V helpers ───────────────────────────────────────────────────
    get deltaVPct()     { return this.deltaVCapacity > 0 ? this.deltaV / this.deltaVCapacity : 0; }
    get deltaVWarning() {
        const p = this.deltaVPct;
        if (p <= CONFIG.DELTA_V_WARN_CRITICAL) return 'critical';
        if (p <= CONFIG.DELTA_V_WARN_LOW)      return 'low';
        return 'ok';
    }
    canAfford(cost)     { return this.deltaV >= cost; }
    spend(cost)         {
        this.deltaV    = Math.max(0, this.deltaV - cost);
        this.fuelUnits = this.deltaV;
    }
    get thrustMult()    { return (CONFIG.THRUSTER_CLASSES[this.thrusterClass] || CONFIG.THRUSTER_CLASSES.chemical).speedMult; }

    // ── Power helpers ────────────────────────────────────────────────────
    get batteryPct()    { return this.batteryCapacity > 0 ? this.battery / this.batteryCapacity : 0; }
}

// ─── Utility Satellite ────────────────────────────────────────────────────────

class UtilitySat extends Satellite {
    constructor(orbit, angle) {
        super('utility', orbit, angle, 'player');
        this.moneyPerSecond = orbit.moneyRate;
        this.safeMode       = false;
        this.escortedById   = null;
    }
}

// ─── Friendly RPO Satellite ──────────────────────────────────────────────────

class RPOSat extends Satellite {
    constructor(orbit, angle) {
        super('rpo', orbit, angle, 'player');
        this.mode       = 'patrol';
        this.targetId   = null;
        this.escorteeId = null;
    }
}

// ─── Relay Satellite ──────────────────────────────────────────────────────────

class RelaySat extends Satellite {
    constructor(orbit, angle) {
        super('relay', orbit, angle, 'player');
        this.commsRadius = CONFIG.RELAY_COMMS_RADIUS;
    }
}

// ─── Maintenance Satellite ────────────────────────────────────────────────────

class MaintenanceSat extends Satellite {
    constructor(orbit, angle) {
        super('maintenance', orbit, angle, 'player');
        this.mode       = 'standby';
        this.targetId   = null;
        this.refueling  = false;
        this.refuelTimer = 0;
        this.defendRadius = CONFIG.MAINTENANCE_DEFEND_RADIUS;
    }
}

// ─── Enemy RPO Satellite ──────────────────────────────────────────────────────

class EnemyRPOSat extends Satellite {
    constructor(orbit, angle) {
        super('enemy_rpo', orbit, angle, 'enemy');
        this.targetId = null;
        this.mode     = 'approach';
    }

    update(dt, targetSat) {
        if (!this.alive) return;

        // Handle orbit transfer
        if (this.transferring) {
            this.transferProgress += dt / this.transferDuration;
            if (this.transferProgress >= 1) {
                this.transferProgress = 1;
                this.orbit = this.transferTarget;
                this.angularVelocity = Utils.angularVelocity(this.orbit.period);
                this.transferring = false;
                this.transferTarget = null;
                this.transferFromOrbit = null;
                this.subLevel = 3;
            }
            this.angle = Utils.normalizeAngle(this.angle + this.angularVelocity * dt);
            this._updateTransferPos();
            return;
        }

        if (targetSat && targetSat.alive && this.orbit.key === targetSat.orbit.key) {
            const diff        = Utils.angleDiff(this.angle, targetSat.angle);
            const pursuitStep = CONFIG.ENEMY_APPROACH_SPEED * this.thrustMult * dt;
            this.angle = Utils.normalizeAngle(
                this.angle + this.angularVelocity * dt + Math.sign(diff) * pursuitStep
            );
            if (this.deltaV > 0) this.spend(CONFIG.DELTA_V_DRAIN.intercept * dt * 0.5);
        } else {
            this.angle = Utils.normalizeAngle(this.angle + this.angularVelocity * dt);
        }
        this._updatePos();
    }
}

// ─── DA-ASAT Missile ──────────────────────────────────────────────────────────

class ASATMissile extends Entity {
    constructor(targetSat) {
        super('asat');
        this.targetId = targetSat.id;
        const a = Math.random() * Math.PI * 2;
        this.x    = Math.cos(a) * CONFIG.EARTH_RADIUS * 5;
        this.y    = Math.sin(a) * CONFIG.EARTH_RADIUS * 5;
        this.speed = 95;
        this.alive = true;
    }
    update(dt, targetSat) {
        if (!this.alive || !targetSat || !targetSat.alive) { this.alive = false; return; }
        const dx = targetSat.x - this.x, dy = targetSat.y - this.y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 1;
        this.x += dx / d * this.speed * dt;
        this.y += dy / d * this.speed * dt;
    }
}

// ─── Launch Rocket ────────────────────────────────────────────────────────────

class LaunchRocket extends Entity {
    constructor(station, payload) {
        super('rocket');
        this.stationId = station.id;
        this.payload   = payload;
        this.x = this.startX = station.x;
        this.y = this.startY = station.y;
        this.progress  = 0;
        this.alive     = true;
        this.duration  = 3 + payload.orbit.radius / 50;
        this.elapsed   = 0;
    }
    update(dt) {
        if (!this.alive) return;
        this.elapsed += dt;
        this.progress = Math.min(1, this.elapsed / this.duration);
        const t = Utils.orbitPos(this.payload.orbit.radius, this.payload.angle);
        this.x = Utils.lerp(this.startX, t.x, this.progress);
        this.y = Utils.lerp(this.startY, t.y, this.progress);
        if (this.progress >= 1) this.alive = false;
    }
}

// ─── Debris Cloud ─────────────────────────────────────────────────────────────

class DebrisCloud extends Entity {
    constructor(orbit, angle) {
        super('debris');
        this.orbit   = orbit;
        this.angle   = Utils.normalizeAngle(angle);
        this.spread  = CONFIG.DEBRIS_INITIAL_SPREAD;
        this.density = 1.0;
        this.alive   = true;
        this.angularVelocity = Utils.angularVelocity(orbit.period);
        this._updatePos();
    }
    _updatePos() {
        this.x = Math.cos(this.angle) * this.orbit.radius;
        this.y = Math.sin(this.angle) * this.orbit.radius;
    }
    update(dt) {
        if (!this.alive) return;
        this.angle   = Utils.normalizeAngle(this.angle + this.angularVelocity * dt);
        this.spread  = Math.min(Math.PI * 0.8, this.spread + 0.002 * dt);
        this.density -= this.orbit.debrisDecay * dt;
        if (this.density <= 0) { this.density = 0; this.alive = false; }
        this._updatePos();
    }
    hits(sat) {
        if (sat.orbit.key !== this.orbit.key) return false;
        return Math.abs(Utils.angleDiff(this.angle, sat.angle)) < this.spread;
    }
}

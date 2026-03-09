'use strict';

/**
 * Comms — determines which player satellites are reachable for tasking.
 *
 * Chain rule:
 *   A satellite is "in comms" if:
 *   (a) it is within a ground station's horizon, OR
 *   (b) it is within a relay sat's commsRadius AND that relay sat is itself in comms.
 *
 * Jamming: active jammers block enemy satellite comms in their radius,
 * and can disrupt enemy targeting.
 */
const Comms = {
    /**
     * Update inComms flag for all player satellites.
     * @param {GroundStation[]} groundStations
     * @param {Satellite[]}     satellites
     * @param {Array}           activeJammers - [{x, y, radius, timer}]
     */
    update(groundStations, satellites, activeJammers) {
        const playerSats = satellites.filter(s => s.faction === 'player' && s.alive);
        const relays     = playerSats.filter(s => s.type === 'relay');

        // Reset
        playerSats.forEach(s => { s.inComms = false; });

        // Step 1: direct ground-station links
        for (const gs of groundStations) {
            if (!gs.active) continue;
            for (const sat of playerSats) {
                if (Comms._groundCanReach(gs, sat)) {
                    sat.inComms = true;
                }
            }
        }

        // Step 2: relay chains (iterate until stable)
        let changed = true;
        while (changed) {
            changed = false;
            for (const relay of relays) {
                if (!relay.inComms) continue;
                for (const sat of playerSats) {
                    if (sat.inComms) continue;
                    if (Comms._relayCanReach(relay, sat)) {
                        sat.inComms = true;
                        changed = true;
                    }
                }
            }
        }

        // Step 3: jamming — disrupt enemy satellites in jammer radius
        const enemySats = satellites.filter(s => s.faction === 'enemy' && s.alive);
        enemySats.forEach(s => { s._jammed = false; });
        if (activeJammers && activeJammers.length > 0) {
            for (const jammer of activeJammers) {
                for (const enemy of enemySats) {
                    const d = Utils.dist(jammer.x, jammer.y, enemy.x, enemy.y);
                    if (d < jammer.radius) {
                        enemy.inComms = false;
                        enemy._jammed = true;
                    }
                }
            }
        }
    },

    /** Ground station can reach sat if sat is within the horizon cone */
    _groundCanReach(gs, sat) {
        const d = Utils.dist(0, 0, sat.x, sat.y);
        if (d > CONFIG.GROUND_COMMS_HORIZON) return false;
        const satAngle = Math.atan2(sat.y, sat.x);
        const diff = Math.abs(Utils.angleDiff(gs.angle, satAngle));
        return diff < Utils.deg2rad(65);
    },

    /** Relay satellite can reach another satellite within its comms radius */
    _relayCanReach(relay, sat) {
        return Utils.dist(relay.x, relay.y, sat.x, sat.y) <= relay.commsRadius;
    },

    /**
     * Returns true if a given satellite can currently be tasked.
     */
    canTask(sat) {
        return sat && sat.faction === 'player' && sat.alive && sat.inComms;
    },
};

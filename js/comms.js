'use strict';

/**
 * Comms — determines which player satellites are reachable for tasking.
 *
 * Chain rule:
 *   A satellite is "in comms" if:
 *   (a) it is within a ground station's horizon, OR
 *   (b) it is within a relay sat's commsRadius AND that relay sat is itself in comms.
 *
 * We resolve iteratively until no new satellites are added (handles multi-hop chains).
 */
const Comms = {
    /**
     * Update inComms flag for all player satellites.
     * @param {GroundStation[]} groundStations
     * @param {Satellite[]}     satellites  — all satellites (we only tag player ones)
     */
    update(groundStations, satellites) {
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
                if (!relay.inComms) continue;   // relay itself must be reachable
                for (const sat of playerSats) {
                    if (sat.inComms) continue;
                    if (Comms._relayCanReach(relay, sat)) {
                        sat.inComms = true;
                        changed = true;
                    }
                }
            }
        }
    },

    /** Ground station can reach sat if sat is within the horizon cone */
    _groundCanReach(gs, sat) {
        const d = Utils.dist(0, 0, sat.x, sat.y);  // dist from Earth center
        if (d > CONFIG.GROUND_COMMS_HORIZON) return false;

        // Angular separation between ground station and satellite (as seen from center)
        const satAngle = Math.atan2(sat.y, sat.x);
        const diff = Math.abs(Utils.angleDiff(gs.angle, satAngle));
        // Ground station covers ~130° arc (65° each side from its longitude)
        return diff < Utils.deg2rad(65);
    },

    /** Relay satellite can reach another satellite within its comms radius */
    _relayCanReach(relay, sat) {
        return Utils.dist(relay.x, relay.y, sat.x, sat.y) <= relay.commsRadius;
    },

    /**
     * Returns true if a given satellite can currently be tasked.
     * (Must be player-owned and in comms.)
     */
    canTask(sat) {
        return sat && sat.faction === 'player' && sat.alive && sat.inComms;
    },
};

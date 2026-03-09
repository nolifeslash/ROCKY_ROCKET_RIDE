'use strict';

const AI = {
    /**
     * Update all enemy RPO-sats using coverage-aware targeting.
     * Enemies prefer: out-of-comms targets, low delta-v, unescorted, same orbit.
     * Orbit transfers happen gradually (enemy commits after being on orbit for a while).
     */
    updateEnemySats(enemySats, allSats, dt) {
        const utilMap = {};
        allSats.filter(s => s.type === 'utility' && s.alive)
               .forEach(s => { utilMap[s.id] = s; });

        for (const enemy of enemySats) {
            if (!enemy.alive) continue;

            const targets = Object.values(utilMap);
            if (targets.length === 0) continue;

            // Score targets — higher = better for enemy
            let bestTarget = null, bestScore = -Infinity;
            for (const t of targets) {
                let score = 0;
                if (!t.inComms)           score += 5;          // hard to command
                score += (1 - t.deltaVPct) * 3;               // low dV = can't dodge
                if (t.orbit.key === enemy.orbit.key) score += 4; // same orbit = easy approach
                score -= Utils.dist(enemy.x, enemy.y, t.x, t.y) * 0.008; // closer = better
                if (t.escortedById)       score -= 2;          // defended target less attractive
                if (score > bestScore) { bestScore = score; bestTarget = t; }
            }

            if (bestTarget) {
                // Orbit transfer: only switch if target is on a different orbit AND
                // the enemy has been on its current orbit for a while (avoid immediate jump)
                if (enemy.orbit.key !== bestTarget.orbit.key) {
                    enemy._orbitTransferTimer = (enemy._orbitTransferTimer || 0) + dt;
                    if (enemy._orbitTransferTimer > 8) {   // commit after 8 s on wrong orbit
                        enemy.orbit               = bestTarget.orbit;
                        enemy.angularVelocity     = Utils.angularVelocity(enemy.orbit.period);
                        enemy._orbitTransferTimer = 0;
                    }
                } else {
                    enemy._orbitTransferTimer = 0;
                }
                enemy.targetId = bestTarget.id;
            }

            enemy.update(dt, bestTarget);
        }
    },

    updateASATs(asats, satMap, dt) {
        for (const m of asats) {
            if (!m.alive) continue;
            m.update(dt, satMap[m.targetId] || null);
        }
    },
};

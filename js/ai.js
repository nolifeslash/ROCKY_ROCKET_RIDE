'use strict';

const AI = {
    /**
     * Update all enemy RPO-sats using coverage-aware targeting.
     * Enemies prefer: out-of-comms targets, low delta-v, unescorted, same orbit.
     * Jammed enemies are slowed and less effective.
     */
    updateEnemySats(enemySats, allSats, dt) {
        const utilMap = {};
        allSats.filter(s => s.type === 'utility' && s.alive)
               .forEach(s => { utilMap[s.id] = s; });

        for (const enemy of enemySats) {
            if (!enemy.alive) continue;

            // Jammed enemies lose targeting temporarily
            if (enemy._jammed) {
                enemy._jammed = false;
                enemy.targetId = null;
                enemy.angle = Utils.normalizeAngle(enemy.angle + enemy.angularVelocity * dt);
                enemy._updatePos();
                continue;
            }

            const targets = Object.values(utilMap);
            if (targets.length === 0) continue;

            // Score targets
            let bestTarget = null, bestScore = -Infinity;
            for (const t of targets) {
                let score = 0;
                if (!t.inComms)           score += 5;
                score += (1 - t.deltaVPct) * 3;
                if (t.orbit.key === enemy.orbit.key) score += 4;
                score -= Utils.dist(enemy.x, enemy.y, t.x, t.y) * 0.008;
                if (t.escortedById)       score -= 2;
                if (t.lowPower)           score += 2;   // low power = vulnerable
                if (score > bestScore) { bestScore = score; bestTarget = t; }
            }

            if (bestTarget) {
                if (enemy.orbit.key !== bestTarget.orbit.key) {
                    enemy._orbitTransferTimer = (enemy._orbitTransferTimer || 0) + dt;
                    if (enemy._orbitTransferTimer > 8) {
                        // Use Hohmann-style transfer for enemies too
                        if (!enemy.transferring) {
                            enemy.transferring     = true;
                            enemy.transferFromOrbit = enemy.orbit;
                            enemy.transferTarget   = bestTarget.orbit;
                            enemy.transferProgress = 0;
                            enemy.transferDuration = CONFIG.HOHMANN_TRANSFER_TIME * 1.2;
                        }
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

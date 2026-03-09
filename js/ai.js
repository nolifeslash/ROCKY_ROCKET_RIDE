'use strict';

/**
 * AI — controls enemy RPO-sats and ASAT missiles.
 */
const AI = {
    /**
     * Update all enemy RPO-sats: pursue their assigned target.
     * @param {EnemyRPOSat[]} enemySats
     * @param {Satellite[]}   allSats   — all satellites (to look up targets)
     * @param {number}        dt
     */
    updateEnemySats(enemySats, allSats, dt) {
        const utilityMap = {};
        allSats.filter(s => s.type === 'utility' && s.alive)
               .forEach(s => { utilityMap[s.id] = s; });

        for (const enemy of enemySats) {
            if (!enemy.alive) continue;

            // Re-assign target if current is gone
            if (!enemy.targetId || !utilityMap[enemy.targetId]) {
                const targets = Object.values(utilityMap);
                if (targets.length === 0) { enemy.mode = 'orbit'; continue; }
                // Pick the utility sat on the same or nearest orbit
                let best = null, bestDist = Infinity;
                for (const t of targets) {
                    const d = Utils.dist(enemy.x, enemy.y, t.x, t.y);
                    if (d < bestDist) { bestDist = d; best = t; }
                }
                enemy.targetId = best.id;
            }

            const target = utilityMap[enemy.targetId] || null;
            enemy.update(dt, target);
        }
    },

    /**
     * Update ASAT missiles toward their targets.
     * @param {ASATMissile[]} asats
     * @param {object}        satMap   id → satellite
     * @param {number}        dt
     */
    updateASATs(asats, satMap, dt) {
        for (const m of asats) {
            if (!m.alive) continue;
            m.update(dt, satMap[m.targetId] || null);
        }
    },
};

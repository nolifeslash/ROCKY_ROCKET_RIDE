'use strict';

const Renderer = {
    init(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this.cx     = canvas.width  / 2;
        this.cy     = canvas.height / 2;
        this._stars = null;
    },

    draw(game) {
        const { ctx, cx, cy } = this;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this._drawStars();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(game.zoom, game.zoom);

        // Sun illumination layer (behind everything)
        this._drawSunLight(game);

        if (game.showCoverage) this._drawCoverageOverlay(game);

        this._drawOrbits(game);
        this._drawEarth(game);
        this._drawGroundStations(game.groundStations, game);
        this._drawJammers(game);
        this._drawDebris(game.debris);
        this._drawRockets(game.rockets);

        if (game.showThreats) this._drawThreatArrows(game);

        this._drawSatellites(game.satellites, game.selectedSat, game);
        this._drawASATs(game.asats);
        this._drawSelectionRing(game.selectedSat);

        ctx.restore();

        this._drawHUD(game);
        this._drawObjective(game);

        if (game.gameOver) this._drawEndOverlay(game);
        if (game.paused && !game.gameOver) this._drawPauseOverlay();
    },

    // ── Stars ─────────────────────────────────────────────────────────────────

    _drawStars() {
        const ctx = this.ctx;
        if (!this._stars) {
            this._stars = [];
            let s = 12345;
            for (let i = 0; i < 320; i++) {
                s = (s * 1664525 + 1013904223) >>> 0;
                const x = (s & 0xFFFF) / 65535 * CONFIG.CANVAS_WIDTH;
                s = (s * 1664525 + 1013904223) >>> 0;
                const y = (s & 0xFFFF) / 65535 * CONFIG.CANVAS_HEIGHT;
                s = (s * 1664525 + 1013904223) >>> 0;
                const r = ((s & 0xFF) / 255) * 1.5 + 0.2;
                const b = ((s & 0x0F) / 15) * 0.5 + 0.5;
                this._stars.push({ x, y, r, b });
            }
        }
        for (const st of this._stars) {
            ctx.beginPath();
            ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${st.b})`;
            ctx.fill();
        }
    },

    // ── Sun Illumination ─────────────────────────────────────────────────────

    _drawSunLight(game) {
        const ctx = this.ctx;
        const sunX = Math.cos(game.sunAngle) * 500;
        const sunY = Math.sin(game.sunAngle) * 500;

        // Draw sun glow
        const grd = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 80);
        grd.addColorStop(0, 'rgba(255,255,200,0.3)');
        grd.addColorStop(0.5, 'rgba(255,220,100,0.08)');
        grd.addColorStop(1, 'rgba(255,200,50,0)');
        ctx.beginPath();
        ctx.arc(sunX, sunY, 80, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Sun symbol
        ctx.beginPath();
        ctx.arc(sunX, sunY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffee88';
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,200,0.6)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('☀', sunX, sunY - 12);

        // Subtle illumination gradient over the play area
        const illGrd = ctx.createLinearGradient(
            sunX * 0.5, sunY * 0.5,
            -sunX * 0.5, -sunY * 0.5
        );
        illGrd.addColorStop(0, 'rgba(255,255,200,0.03)');
        illGrd.addColorStop(1, 'rgba(0,0,30,0.05)');
        ctx.fillStyle = illGrd;
        ctx.fillRect(-500, -500, 1000, 1000);
    },

    // ── Coverage Overlay ─────────────────────────────────────────────────────

    _drawCoverageOverlay(game) {
        const ctx   = this.ctx;
        const alpha = CONFIG.COVERAGE_OVERLAY_ALPHA;

        for (const gs of game.groundStations) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, CONFIG.GROUND_COMMS_HORIZON,
                gs.angle - Utils.deg2rad(65),
                gs.angle + Utils.deg2rad(65));
            ctx.closePath();
            ctx.fillStyle = `rgba(68,255,136,${alpha})`;
            ctx.fill();
        }

        const relays = game.satellites.filter(s => s.type === 'relay' && s.alive && s.inComms);
        for (const r of relays) {
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.commsRadius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,220,60,${alpha})`;
            ctx.fill();
        }
    },

    // ── Orbital Rings ─────────────────────────────────────────────────────────

    _drawOrbits(game) {
        const ctx      = this.ctx;
        const orbKeys  = Object.keys(CONFIG.ORBITS);
        const labelAngles = [-0.25, -0.60, -0.95, -1.30, -1.65, -2.00, -2.35, -2.70];

        orbKeys.forEach((key, idx) => {
            const orb       = CONFIG.ORBITS[key];
            const selected  = game.selectedSat;
            const highlight = selected && selected.orbit.key === key;

            // Draw sub-level bands (faint)
            for (let sl = 1; sl <= CONFIG.SUB_LEVELS; sl++) {
                const offset = (sl - 3) * CONFIG.SUB_LEVEL_SPACING;
                const r = orb.radius + offset;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                if (highlight && selected.subLevel === sl) {
                    ctx.strokeStyle = orb.color;
                    ctx.lineWidth = 1.2;
                    ctx.setLineDash([]);
                } else {
                    ctx.strokeStyle = this._alpha(orb.color, highlight ? 0.15 : 0.06);
                    ctx.lineWidth = 0.3;
                    ctx.setLineDash([2, 8]);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Main orbit ring
            ctx.beginPath();
            ctx.arc(0, 0, orb.radius, 0, Math.PI * 2);
            ctx.strokeStyle = highlight
                ? orb.color
                : this._alpha(orb.color, 0.22);
            ctx.lineWidth   = highlight ? 1.6 : 0.7;
            ctx.setLineDash(highlight ? [] : [5, 9]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label
            const la = labelAngles[idx % labelAngles.length];
            const lx = Math.cos(la) * (orb.radius + 5);
            const ly = Math.sin(la) * (orb.radius + 5);
            ctx.fillStyle = this._alpha(orb.color, highlight ? 0.95 : 0.50);
            ctx.font      = highlight
                ? 'bold 9px monospace'
                : '8px monospace';
            ctx.textAlign = lx >= 0 ? 'left' : 'right';
            ctx.fillText(orb.name, lx, ly + 3);
        });
    },

    // ── Earth (more realistic) ───────────────────────────────────────────────

    _drawEarth(game) {
        const ctx = this.ctx;
        const r   = CONFIG.EARTH_RADIUS;

        // Atmosphere glow
        const grd = ctx.createRadialGradient(0, 0, r * 0.85, 0, 0, r * 1.30);
        grd.addColorStop(0, 'rgba(60,140,255,0.18)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.30, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Ocean body with day/night shading
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.clip();

        // Ocean gradient
        const ocean = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
        ocean.addColorStop(0, '#2a7cc8');
        ocean.addColorStop(0.5, '#1a5c98');
        ocean.addColorStop(1, '#0e3460');
        ctx.fillStyle = ocean;
        ctx.fillRect(-r, -r, r * 2, r * 2);

        // Continents (more realistic shapes)
        ctx.fillStyle = '#2a7a3a';

        // North America
        ctx.beginPath();
        ctx.moveTo(-48, -38); ctx.lineTo(-35, -45); ctx.lineTo(-22, -40);
        ctx.lineTo(-18, -30); ctx.lineTo(-25, -20); ctx.lineTo(-30, -10);
        ctx.lineTo(-38, -5);  ctx.lineTo(-45, -15); ctx.lineTo(-50, -28);
        ctx.closePath(); ctx.fill();

        // South America
        ctx.beginPath();
        ctx.moveTo(-30, -2); ctx.lineTo(-22, -5); ctx.lineTo(-16, 5);
        ctx.lineTo(-15, 18); ctx.lineTo(-20, 30); ctx.lineTo(-25, 35);
        ctx.lineTo(-28, 28); ctx.lineTo(-32, 15); ctx.lineTo(-33, 5);
        ctx.closePath(); ctx.fill();

        // Europe
        ctx.fillStyle = '#338844';
        ctx.beginPath();
        ctx.moveTo(5, -38); ctx.lineTo(15, -42); ctx.lineTo(22, -38);
        ctx.lineTo(20, -30); ctx.lineTo(12, -28); ctx.lineTo(5, -32);
        ctx.closePath(); ctx.fill();

        // Africa
        ctx.fillStyle = '#3a8a3a';
        ctx.beginPath();
        ctx.moveTo(8, -24); ctx.lineTo(18, -26); ctx.lineTo(28, -18);
        ctx.lineTo(30, -5);  ctx.lineTo(25, 10);  ctx.lineTo(18, 18);
        ctx.lineTo(10, 12);  ctx.lineTo(5, 0);    ctx.lineTo(4, -15);
        ctx.closePath(); ctx.fill();

        // Asia
        ctx.fillStyle = '#2e7e35';
        ctx.beginPath();
        ctx.moveTo(25, -42); ctx.lineTo(40, -45); ctx.lineTo(55, -38);
        ctx.lineTo(60, -28); ctx.lineTo(55, -18); ctx.lineTo(45, -14);
        ctx.lineTo(35, -20); ctx.lineTo(28, -30);
        ctx.closePath(); ctx.fill();

        // India
        ctx.fillStyle = '#348838';
        ctx.beginPath();
        ctx.moveTo(38, -12); ctx.lineTo(44, -15); ctx.lineTo(46, -5);
        ctx.lineTo(42, 2);   ctx.lineTo(36, -2);
        ctx.closePath(); ctx.fill();

        // Southeast Asia / Indonesia
        ctx.fillStyle = '#2c7630';
        this._ellipse(ctx, 52, -6, 8, 4);
        this._ellipse(ctx, 58, 0, 6, 3);
        this._ellipse(ctx, 55, 5, 5, 2);

        // Australia
        ctx.fillStyle = '#8a6a30';
        ctx.beginPath();
        ctx.moveTo(52, 12); ctx.lineTo(65, 10); ctx.lineTo(68, 18);
        ctx.lineTo(62, 25); ctx.lineTo(52, 22); ctx.lineTo(48, 16);
        ctx.closePath(); ctx.fill();

        // Antarctica
        ctx.fillStyle = '#d8e8f0';
        ctx.beginPath();
        ctx.moveTo(-40, 55); ctx.lineTo(-10, 58); ctx.lineTo(20, 56);
        ctx.lineTo(45, 58);  ctx.lineTo(50, 64);  ctx.lineTo(-45, 64);
        ctx.closePath(); ctx.fill();

        // Greenland
        ctx.fillStyle = '#c8dce8';
        this._ellipse(ctx, -18, -50, 8, 6);

        // Cloud wisps (subtle)
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(-20, -15, 25, -0.5, 0.8); ctx.stroke();
        ctx.beginPath();
        ctx.arc(30, 5, 20, 0.3, 1.5); ctx.stroke();
        ctx.beginPath();
        ctx.arc(-5, 25, 18, -0.3, 1.0); ctx.stroke();

        // Day/night terminator
        if (game) {
            const nightAngle = game.sunAngle + Math.PI;
            ctx.beginPath();
            ctx.arc(0, 0, r, nightAngle - Math.PI / 2, nightAngle + Math.PI / 2);
            ctx.fillStyle = 'rgba(0,0,20,0.35)';
            ctx.fill();
        }

        ctx.restore();

        // Atmosphere rim
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(100,180,255,0.45)';
        ctx.lineWidth   = 3;
        ctx.stroke();
        ctx.lineWidth = 1;
    },

    _ellipse(ctx, x, y, rx, ry) {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    // ── Ground Stations ───────────────────────────────────────────────────────

    _drawGroundStations(stations, game) {
        const ctx = this.ctx;
        for (const gs of stations) {
            const nx = Math.cos(gs.angle), ny = Math.sin(gs.angle);

            // Coverage cone (faint)
            ctx.beginPath();
            ctx.arc(0, 0, CONFIG.GROUND_COMMS_HORIZON,
                gs.angle - Utils.deg2rad(65),
                gs.angle + Utils.deg2rad(65));
            ctx.strokeStyle = 'rgba(68,255,136,0.07)';
            ctx.lineWidth   = 1;
            ctx.stroke();

            // Station dot
            ctx.beginPath();
            ctx.arc(gs.x, gs.y, 5, 0, Math.PI * 2);
            ctx.fillStyle   = gs.jamActive ? '#ff88ff' : '#44ff88';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = 1;
            ctx.stroke();

            // Uplink mast
            ctx.beginPath();
            ctx.moveTo(gs.x, gs.y);
            ctx.lineTo(gs.x + nx * 11, gs.y + ny * 11);
            ctx.strokeStyle = gs.jamActive ? '#ff88ff' : '#44ff88';
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            // Label with slot info
            ctx.fillStyle = '#aaffcc';
            ctx.font      = '8px monospace';
            ctx.textAlign = 'center';
            const slotInfo = gs.launchSlots > 1 ? ` [${gs.availableSlots}/${gs.launchSlots}]` : '';
            ctx.fillText(gs.name + slotInfo, gs.x + nx * 20, gs.y + ny * 20 + 3);

            // Jam active indicator
            if (gs.jamActive) {
                ctx.beginPath();
                ctx.arc(gs.x, gs.y, 8, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255,136,255,0.6)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        ctx.lineWidth = 1;
    },

    // ── Jammers ───────────────────────────────────────────────────────────────

    _drawJammers(game) {
        const ctx = this.ctx;
        for (const j of game.activeJammers) {
            const pulse = 0.5 + 0.3 * Math.sin(Date.now() * 0.008);
            ctx.beginPath();
            ctx.arc(j.x, j.y, j.radius * pulse, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,100,255,${0.15 + pulse * 0.1})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(j.x, j.y, j.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,100,255,0.03)`;
            ctx.fill();
            ctx.lineWidth = 1;
        }
    },

    // ── Debris ────────────────────────────────────────────────────────────────

    _drawDebris(debrisList) {
        const ctx = this.ctx;
        for (const d of debrisList) {
            if (!d.alive) continue;
            const a = d.density * 0.7;

            ctx.beginPath();
            ctx.arc(0, 0, d.orbit.radius, d.angle - d.spread, d.angle + d.spread);
            ctx.strokeStyle = `rgba(255,110,0,${a})`;
            ctx.lineWidth   = 6;
            ctx.stroke();
            ctx.lineWidth = 1;

            const n = Math.ceil(d.density * 14);
            for (let i = 0; i < n; i++) {
                const pa = d.angle + Utils.rand(-d.spread, d.spread);
                const pr = d.orbit.radius + Utils.rand(-5, 5);
                ctx.beginPath();
                ctx.arc(Math.cos(pa) * pr, Math.sin(pa) * pr, 1.2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,170,50,${a * 0.8})`;
                ctx.fill();
            }
        }
    },

    // ── Threat Arrows ────────────────────────────────────────────────────────

    _drawThreatArrows(game) {
        const ctx    = this.ctx;
        const satMap = {};
        game.satellites.forEach(s => { satMap[s.id] = s; });

        for (const enemy of game.satellites.filter(s => s.type === 'enemy_rpo' && s.alive)) {
            const target = satMap[enemy.targetId];
            if (!target || !target.alive) continue;

            const dx = target.x - enemy.x, dy = target.y - enemy.y;
            const d  = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / d, uy = dy / d;

            ctx.beginPath();
            ctx.moveTo(enemy.x + ux * 10, enemy.y + uy * 10);
            ctx.lineTo(target.x - ux * 14, target.y - uy * 14);
            ctx.strokeStyle = 'rgba(255,60,60,0.55)';
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            const ex = target.x - ux * 14, ey = target.y - uy * 14;
            const ax = -uy * 5, ay = ux * 5;
            ctx.beginPath();
            ctx.moveTo(ex + ux * 9, ey + uy * 9);
            ctx.lineTo(ex - ax, ey - ay);
            ctx.lineTo(ex + ax, ey + ay);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,60,60,0.70)';
            ctx.fill();
            ctx.lineWidth = 1;
        }

        // ASAT threat arrows
        const satMap2 = {};
        game.satellites.forEach(s => { satMap2[s.id] = s; });
        for (const m of game.asats) {
            if (!m.alive) continue;
            const t = satMap2[m.targetId];
            if (!t || !t.alive) continue;
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            const dx2 = t.x - m.x, dy2 = t.y - m.y;
            const d2  = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
            ctx.lineTo(t.x - dx2 / d2 * 14, t.y - dy2 / d2 * 14);
            ctx.strokeStyle = 'rgba(255,0,0,0.7)';
            ctx.lineWidth   = 2;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineWidth = 1;
        }
    },

    // ── Satellites ────────────────────────────────────────────────────────────

    _drawSatellites(satellites, selectedSat, game) {
        for (const sat of satellites) {
            if (!sat.alive) continue;
            this._drawSat(sat, sat === selectedSat, game);
        }
    },

    _drawSat(sat, selected, game) {
        const ctx = this.ctx;

        const STYLES = {
            utility:     { color: '#44ccff', shape: 'square',   size: 6 },
            rpo:         { color: '#44ff88', shape: 'diamond',  size: 6 },
            relay:       { color: '#ffdd44', shape: 'hexagon',  size: 7 },
            maintenance: { color: '#88ffdd', shape: 'pentagon', size: 7 },
            enemy_rpo:   { color: '#ff4444', shape: 'triangle', size: 6 },
        };
        const st = STYLES[sat.type] || { color: '#aaaaaa', shape: 'circle', size: 5 };

        let color = st.color;
        if (sat.faction === 'player' && !sat.inComms) color = this._alpha(st.color, 0.4);
        if (sat.noPower) color = this._alpha('#666666', 0.5);
        const flickerOk = sat.health >= 50 || (Math.sin(Date.now() * 0.015) > 0);

        ctx.save();
        ctx.translate(sat.x, sat.y);
        ctx.globalAlpha = flickerOk ? 1 : 0.45;

        // Transfer arc visualization
        if (sat.transferring && sat.transferFromOrbit && sat.transferTarget) {
            ctx.beginPath();
            ctx.arc(
                -sat.x, -sat.y,
                Utils.lerp(sat.transferFromOrbit.radius, sat.transferTarget.radius, sat.transferProgress),
                sat.angle - 0.3, sat.angle + 0.3
            );
            ctx.strokeStyle = 'rgba(255,220,100,0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineWidth = 1;
        }

        // Selection glow
        if (selected) {
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.006);
            ctx.beginPath();
            ctx.arc(0, 0, st.size + 8 + pulse * 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,100,0.12)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, 0, st.size + 5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,255,100,${0.5 + pulse * 0.4})`;
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        }

        // Body
        ctx.fillStyle   = color;
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth   = 1;
        this._shape(ctx, st.shape, st.size);

        // Safe-mode ring
        if (sat.safeMode) {
            ctx.beginPath();
            ctx.arc(0, 0, st.size + 3, 0, Math.PI * 2);
            ctx.strokeStyle = '#88ccff';
            ctx.lineWidth   = 1;
            ctx.stroke();
        }

        // Refueling indicator
        if (sat.refueling) {
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.01);
            ctx.beginPath();
            ctx.arc(0, 0, st.size + 4, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(136,255,221,${0.3 + pulse * 0.5})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([2, 2]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Escort link dots
        if (sat.escortedById) {
            ctx.beginPath();
            ctx.arc(0, st.size + 4, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#44ff88';
            ctx.fill();
        }

        // Health bar (shows when damaged)
        if (sat.health < 100) {
            const bw = 16, bh = 2.5;
            ctx.fillStyle = '#222';
            ctx.fillRect(-bw / 2, st.size + 3, bw, bh);
            ctx.fillStyle = sat.health > 50 ? '#44ff88' : '#ff6600';
            ctx.fillRect(-bw / 2, st.size + 3, bw * (sat.health / 100), bh);
        }

        // Delta-V bar
        this._drawDVBar(ctx, sat, st.size);

        // Power indicator (small battery icon)
        if (sat.faction === 'player') {
            this._drawPowerBar(ctx, sat, st.size);
        }

        // Sunlight indicator
        if (sat.faction === 'player' && !sat.inSunlight) {
            ctx.fillStyle = 'rgba(50,50,100,0.6)';
            ctx.font = '6px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('●', -st.size - 3, -st.size - 1);
        }

        // Out-of-comms indicator
        if (sat.faction === 'player' && !sat.inComms) {
            ctx.beginPath();
            ctx.arc(st.size + 1, -st.size - 1, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#ff8800';
            ctx.fill();
        }

        // No-power indicator
        if (sat.noPower) {
            ctx.fillStyle = '#ff4444';
            ctx.font = '7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('⚡', st.size + 5, 0);
        }

        // Label above
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font      = '7px monospace';
        ctx.textAlign = 'center';
        const prefix = sat.type === 'maintenance' ? 'MNT' : sat.type.slice(0,3).toUpperCase();
        ctx.fillText(`${prefix}-${sat.id}`, 0, -st.size - 4);

        ctx.restore();
    },

    _drawDVBar(ctx, sat, size) {
        if (sat.faction !== 'player') return;
        const bw = 14, bh = 2;
        const by = size + 7;
        const pct = sat.deltaVPct;
        const warn = sat.deltaVWarning;
        const barColor = warn === 'critical' ? '#ff2222'
                       : warn === 'low'      ? '#ffaa00'
                       :                       '#44aaff';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-bw / 2, by, bw, bh);
        ctx.fillStyle = barColor;
        ctx.fillRect(-bw / 2, by, bw * pct, bh);
    },

    _drawPowerBar(ctx, sat, size) {
        const bw = 14, bh = 1.5;
        const by = size + 10;
        const pct = sat.batteryPct;
        const barColor = pct < CONFIG.NO_POWER_THRESHOLD ? '#ff2222'
                       : pct < CONFIG.LOW_POWER_THRESHOLD ? '#ffaa00'
                       : '#ffee44';
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(-bw / 2, by, bw, bh);
        ctx.fillStyle = barColor;
        ctx.fillRect(-bw / 2, by, bw * pct, bh);
    },

    _shape(ctx, shape, size) {
        ctx.beginPath();
        switch (shape) {
            case 'square':
                ctx.rect(-size, -size, size * 2, size * 2); break;
            case 'diamond':
                ctx.moveTo(0, -size); ctx.lineTo(size, 0);
                ctx.lineTo(0, size);  ctx.lineTo(-size, 0);
                ctx.closePath(); break;
            case 'hexagon':
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
                    i === 0 ? ctx.moveTo(Math.cos(a) * size, Math.sin(a) * size)
                            : ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
                }
                ctx.closePath(); break;
            case 'pentagon':
                for (let i = 0; i < 5; i++) {
                    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
                    i === 0 ? ctx.moveTo(Math.cos(a) * size, Math.sin(a) * size)
                            : ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
                }
                ctx.closePath(); break;
            case 'triangle':
                ctx.moveTo(0, -size); ctx.lineTo(size, size);
                ctx.lineTo(-size, size); ctx.closePath(); break;
            default:
                ctx.arc(0, 0, size, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
    },

    // ── ASAT Missiles ─────────────────────────────────────────────────────────

    _drawASATs(asats) {
        const ctx = this.ctx;
        for (const m of asats) {
            if (!m.alive) continue;
            ctx.save();
            ctx.translate(m.x, m.y);

            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,60,0,0.85)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();

            ctx.fillStyle = '#ff4444';
            ctx.font      = '7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('ASAT', 0, -9);

            ctx.restore();
        }
    },

    // ── Rockets ───────────────────────────────────────────────────────────────

    _drawRockets(rockets) {
        const ctx = this.ctx;
        for (const r of rockets) {
            if (!r.alive && !r.deployed) continue;
            if (!r.alive) continue;
            ctx.save();
            ctx.translate(r.x, r.y);
            ctx.beginPath();
            ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
            ctx.fillStyle   = '#88ffdd';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = 0.8;
            ctx.stroke();

            const dx = r.x - r.startX, dy = r.y - r.startY;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 2) {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-(dx / len) * 14, -(dy / len) * 14);
                ctx.strokeStyle = 'rgba(136,255,221,0.4)';
                ctx.lineWidth   = 2;
                ctx.stroke();
            }
            ctx.lineWidth = 1;
            ctx.restore();
        }
    },

    // ── Selection Ring ────────────────────────────────────────────────────────

    _drawSelectionRing(sat) {
        if (!sat || !sat.alive) return;
        const ctx   = this.ctx;
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
        ctx.beginPath();
        ctx.arc(sat.x, sat.y, 16 + pulse * 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,100,${0.25 + pulse * 0.2})`;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        ctx.lineWidth = 1;
    },

    // ── HUD ───────────────────────────────────────────────────────────────────

    _drawHUD(game) {
        const ctx = this.ctx;
        const W   = this.canvas.width;
        const H   = this.canvas.height;

        // Top bar background
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, W, 38);

        const COL = [14, 190, 370, 540, 700, 870, W - 12];
        ctx.font = '12px monospace';

        // Money
        ctx.fillStyle = '#44ccff';
        ctx.textAlign = 'left';
        ctx.fillText(`₡ ${Utils.formatMoney(game.money)}`, COL[0], 23);

        // Net income indicator
        const net   = game.lastNetIncome;
        const netColor = net >= 0 ? '#44ff88' : '#ff4444';
        const netSign  = net >= 0 ? '+' : '';
        ctx.fillStyle = netColor;
        ctx.font      = '9px monospace';
        ctx.fillText(`${netSign}${net.toFixed(1)}/s`, COL[0] + 100, 23);

        ctx.font = '12px monospace';
        // Score
        ctx.fillStyle = '#ffdd44';
        ctx.fillText(`SCORE: ${Utils.formatMoney(game.score)}`, COL[1], 23);

        // Util sats
        ctx.fillStyle = '#aaffaa';
        ctx.fillText(`UTIL: ${game.utilitySats.length}`, COL[2], 23);

        // Time
        const sec = Math.floor(game.time);
        const mm  = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss  = String(sec % 60).padStart(2, '0');
        ctx.fillStyle = '#88ffdd';
        ctx.fillText(`TIME: ${mm}:${ss}`, COL[3], 23);

        // Threats
        ctx.fillStyle = '#ff6666';
        ctx.fillText(`THREATS: ${game.enemySats.length + game.asats.length}`, COL[4], 23);

        // GS count
        ctx.fillStyle = '#aaffcc';
        ctx.fillText(`GS: ${game.groundStations.length}/${CONFIG.GROUND_STATION_UNLOCKS.length}`, COL[5], 23);

        // Zoom indicator
        ctx.fillStyle  = '#446688';
        ctx.font       = '9px monospace';
        ctx.textAlign  = 'right';
        ctx.fillText(`ZOOM: ${(game.zoom * 100).toFixed(0)}%  [C] coverage  [T] threats  [Space] pause  [+/-] zoom`, W - 10, 14);

        // Scenario objective progress bar
        const sc = game.scenario;
        if (sc && sc.objectives.length > 0) {
            const obj = sc.objectives[0];
            if (obj.type === 'time_with_sats') {
                const pct  = Math.min(1, game.time / obj.timeSeconds);
                const barW = 160, barH = 5;
                const bx   = W / 2 - barW / 2, by = 28;
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(bx, by, barW, barH);
                ctx.fillStyle = '#44ff88';
                ctx.fillRect(bx, by, barW * pct, barH);
                ctx.strokeStyle = 'rgba(68,255,136,0.4)';
                ctx.strokeRect(bx, by, barW, barH);
                ctx.fillStyle = '#88ffaa';
                ctx.font      = '8px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`Survive: ${mm}:${ss} / ${String(Math.floor(obj.timeSeconds/60)).padStart(2,'0')}:00`, W/2, by - 2);
            }
        }

        // Message log (bottom-left)
        const msgs = [...game.messages].reverse();
        msgs.forEach((m, i) => {
            const age   = Math.max(0, game.time - (m.expires - CONFIG.MESSAGE_DURATION));
            const fade  = Math.min(1, Math.min(age * 5, (m.expires - game.time) * 2));
            ctx.globalAlpha = Math.max(0, fade);
            ctx.fillStyle   = m.color;
            ctx.font        = '10px monospace';
            ctx.textAlign   = 'left';
            ctx.fillText(m.text, 8, H - 8 - i * 15);
        });
        ctx.globalAlpha = 1;
    },

    // ── Objective ─────────────────────────────────────────────────────────────

    _drawObjective(game) {
        // (integrated into HUD bar above)
    },

    // ── Pause Overlay ─────────────────────────────────────────────────────────

    _drawPauseOverlay() {
        const ctx = this.ctx;
        const W = this.canvas.width, H = this.canvas.height;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ffdd44';
        ctx.font      = '26px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⏸  PAUSED  —  Press Space to resume', W / 2, H / 2);
    },

    // ── End Overlay ──────────────────────────────────────────────────────────

    _drawEndOverlay(game) {
        const ctx = this.ctx;
        const W = this.canvas.width, H = this.canvas.height;

        ctx.fillStyle = 'rgba(0,0,0,0.80)';
        ctx.fillRect(0, 0, W, H);

        if (game.gameWon) {
            ctx.fillStyle = '#44ff88';
            ctx.font      = '38px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('✓ MISSION COMPLETE', W / 2, H / 2 - 50);
        } else {
            ctx.fillStyle = '#ff2222';
            ctx.font      = '38px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('✗ MISSION FAILED', W / 2, H / 2 - 50);
        }

        ctx.fillStyle = '#ffffff';
        ctx.font      = '16px monospace';
        ctx.fillText(game.gameOverReason, W / 2, H / 2 - 10);

        ctx.fillStyle = '#ffdd44';
        ctx.font      = '18px monospace';
        ctx.fillText(`Final Score: ${Utils.formatMoney(game.score)}`, W / 2, H / 2 + 25);

        ctx.fillStyle = '#aaaaaa';
        ctx.font      = '13px monospace';
        ctx.fillText('[R] Restart  |  [N] Next scenario', W / 2, H / 2 + 65);
    },

    // ── Helpers ───────────────────────────────────────────────────────────────

    _alpha(hex, a) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${a})`;
    },
};

'use strict';

const Renderer = {
    // ── Setup ─────────────────────────────────────────────────────────────────

    init(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        // Resizing handled via CSS; logical size stays at CONFIG values
        this.cx = canvas.width  / 2;
        this.cy = canvas.height / 2;
    },

    // ── Main draw call ────────────────────────────────────────────────────────

    draw(game) {
        const { ctx, cx, cy } = this;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Starfield background (deterministic from seed)
        this._drawStars();

        // Translate to center for all game-world drawing
        ctx.save();
        ctx.translate(cx, cy);

        this._drawOrbits(game);
        this._drawEarth();
        this._drawGroundStations(game.groundStations);
        this._drawDebris(game.debris);
        this._drawRockets(game.rockets);
        this._drawSatellites(game.satellites, game.selectedSat);
        this._drawASATs(game.asats);
        this._drawSelectionHighlight(game.selectedSat);
        this._drawCommsLines(game);

        ctx.restore();

        // HUD (in screen space)
        this._drawHUD(game);

        if (game.gameOver) this._drawGameOver(game);
    },

    // ── Stars ─────────────────────────────────────────────────────────────────

    _drawStars() {
        const ctx = this.ctx;
        if (!this._stars) {
            this._stars = [];
            // Pseudo-random deterministic stars
            let s = 42;
            for (let i = 0; i < 280; i++) {
                s = (s * 1664525 + 1013904223) >>> 0;
                const x = (s & 0xFFFF) / 65535 * CONFIG.CANVAS_WIDTH;
                s = (s * 1664525 + 1013904223) >>> 0;
                const y = (s & 0xFFFF) / 65535 * CONFIG.CANVAS_HEIGHT;
                s = (s * 1664525 + 1013904223) >>> 0;
                const r = ((s & 0xFF) / 255) * 1.4 + 0.2;
                this._stars.push({ x, y, r });
            }
        }
        for (const st of this._stars) {
            ctx.beginPath();
            ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fill();
        }
    },

    // ── Orbital rings ─────────────────────────────────────────────────────────

    _drawOrbits(game) {
        const ctx     = this.ctx;
        const orbKeys = Object.keys(CONFIG.ORBITS);
        // Spread labels around the circle so they don't stack
        const labelAngles = [
            -0.25, -0.55, -0.85, -1.15, -1.45, -1.75, -2.05, -2.35,
        ];

        orbKeys.forEach((key, idx) => {
            const orb = CONFIG.ORBITS[key];
            const selected  = game.selectedSat;
            const highlight = selected && selected.orbit.key === key;

            ctx.beginPath();
            ctx.arc(0, 0, orb.radius, 0, Math.PI * 2);
            ctx.strokeStyle = highlight
                ? orb.color
                : Renderer._hexAlpha(orb.color, 0.25);
            ctx.lineWidth   = highlight ? 1.5 : 0.7;
            ctx.setLineDash(highlight ? [] : [4, 8]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label at staggered angles so they don't overlap
            const la = labelAngles[idx % labelAngles.length];
            const lx = Math.cos(la) * (orb.radius + 4);
            const ly = Math.sin(la) * (orb.radius + 4);
            ctx.fillStyle = Renderer._hexAlpha(orb.color, highlight ? 0.9 : 0.55);
            ctx.font      = highlight
                ? 'bold 9px "Share Tech Mono", monospace'
                : '9px "Share Tech Mono", monospace';
            ctx.textAlign = lx >= 0 ? 'left' : 'right';
            ctx.fillText(orb.name, lx, ly + 3);
        });
    },

    // ── Earth ─────────────────────────────────────────────────────────────────

    _drawEarth() {
        const ctx = this.ctx;
        const r   = CONFIG.EARTH_RADIUS;

        // Atmosphere glow
        const grd = ctx.createRadialGradient(0, 0, r * 0.85, 0, 0, r * 1.25);
        grd.addColorStop(0, 'rgba(60,140,255,0.18)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Ocean
        const earthGrd = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
        earthGrd.addColorStop(0, '#3a8cdc');
        earthGrd.addColorStop(1, '#1a4f8c');
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = earthGrd;
        ctx.fill();

        // Simple landmass blobs
        this._drawLandmasses();

        // Atmosphere rim
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(100,180,255,0.4)';
        ctx.lineWidth   = 3;
        ctx.stroke();
    },

    _drawLandmasses() {
        const ctx = this.ctx;
        ctx.fillStyle = '#2a7a3a';
        // Americas-ish
        this._blob(ctx, -28, -12, 18, 28);
        // Europe/Africa-ish
        this._blob(ctx, 15, -5, 14, 30);
        // Asia-ish
        this._blob(ctx, 45, -18, 28, 20);
        // Antarctica
        this._blob(ctx, 0, 62, 32, 10);
    },

    _blob(ctx, x, y, rx, ry) {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    // ── Ground Stations ───────────────────────────────────────────────────────

    _drawGroundStations(stations) {
        const ctx = this.ctx;
        for (const gs of stations) {
            // Coverage arc
            ctx.beginPath();
            ctx.arc(0, 0, CONFIG.GROUND_COMMS_HORIZON,
                gs.angle - Utils.deg2rad(65),
                gs.angle + Utils.deg2rad(65));
            ctx.strokeStyle = 'rgba(100,255,150,0.08)';
            ctx.lineWidth   = 1;
            ctx.stroke();

            // Icon on Earth surface
            ctx.beginPath();
            ctx.arc(gs.x, gs.y, 5, 0, Math.PI * 2);
            ctx.fillStyle   = '#44ff88';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 1;
            ctx.stroke();

            // Upward antenna line
            const nx = gs.x / CONFIG.EARTH_RADIUS;
            const ny = gs.y / CONFIG.EARTH_RADIUS;
            ctx.beginPath();
            ctx.moveTo(gs.x, gs.y);
            ctx.lineTo(gs.x + nx * 10, gs.y + ny * 10);
            ctx.strokeStyle = '#44ff88';
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            // Name label
            ctx.fillStyle = '#aaffcc';
            ctx.font      = '8px "Share Tech Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(gs.name, gs.x + nx * 18, gs.y + ny * 18);
        }
    },

    // ── Debris Clouds ─────────────────────────────────────────────────────────

    _drawDebris(debrisList) {
        const ctx = this.ctx;
        for (const d of debrisList) {
            if (!d.alive) continue;
            const alpha = d.density * 0.6;
            // Draw arc segment on the orbit
            ctx.beginPath();
            ctx.arc(0, 0, d.orbit.radius,
                d.angle - d.spread,
                d.angle + d.spread);
            ctx.strokeStyle = `rgba(255,120,0,${alpha})`;
            ctx.lineWidth   = 5;
            ctx.stroke();

            // Particle dots
            const count = Math.floor(d.density * 12);
            for (let i = 0; i < count; i++) {
                const a = d.angle + Utils.rand(-d.spread, d.spread);
                const r = d.orbit.radius + Utils.rand(-4, 4);
                ctx.beginPath();
                ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,180,60,${alpha * 0.8})`;
                ctx.fill();
            }
        }
    },

    // ── Satellites ────────────────────────────────────────────────────────────

    _drawSatellites(satellites, selectedSat) {
        for (const sat of satellites) {
            if (!sat.alive) continue;
            this._drawSat(sat, sat === selectedSat);
        }
    },

    _drawSat(sat, selected) {
        const ctx = this.ctx;
        const { x, y } = sat;
        const inComms   = sat.inComms || sat.faction === 'enemy';
        const alpha     = sat.alive ? 1 : 0.3;

        let color, shape, size;

        switch (sat.type) {
            case 'utility':    color = '#44ccff'; shape = 'square'; size = 6; break;
            case 'rpo':        color = '#44ff88'; shape = 'diamond'; size = 6; break;
            case 'relay':      color = '#ffdd44'; shape = 'hexagon'; size = 7; break;
            case 'enemy_rpo':  color = '#ff4444'; shape = 'triangle'; size = 6; break;
            default:           color = '#aaaaaa'; shape = 'circle'; size = 5;
        }

        // Out-of-comms dim
        if (!inComms) color = Renderer._hexAlpha(color, 0.45);

        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = alpha;

        // Damage flicker
        if (sat.health < 50) {
            const flicker = Math.sin(Date.now() * 0.015) > 0.3;
            ctx.globalAlpha = flicker ? alpha : alpha * 0.5;
        }

        // Selection glow
        if (selected) {
            ctx.beginPath();
            ctx.arc(0, 0, size + 8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,100,0.15)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, 0, size + 5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,100,0.8)';
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        }

        // Body
        ctx.fillStyle   = color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 1;
        this._drawShape(ctx, shape, size);

        // Health bar (if damaged)
        if (sat.health < 100 && sat.health > 0) {
            const barW = 14, barH = 3;
            ctx.fillStyle = '#333';
            ctx.fillRect(-barW / 2, size + 3, barW, barH);
            ctx.fillStyle = sat.health > 50 ? '#44ff88' : '#ff6600';
            ctx.fillRect(-barW / 2, size + 3, barW * (sat.health / 100), barH);
        }

        // Comms indicator dot
        if (!inComms && sat.faction === 'player') {
            ctx.beginPath();
            ctx.arc(size + 1, -size - 1, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#ff8800';
            ctx.fill();
        }

        // Status label
        ctx.fillStyle = '#ffffff';
        ctx.font      = '7px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(sat.type.toUpperCase().slice(0, 3) + '-' + sat.id, 0, -size - 3);

        ctx.restore();
    },

    _drawShape(ctx, shape, size) {
        ctx.beginPath();
        switch (shape) {
            case 'square':
                ctx.rect(-size, -size, size * 2, size * 2);
                break;
            case 'diamond':
                ctx.moveTo(0, -size);
                ctx.lineTo(size, 0);
                ctx.lineTo(0, size);
                ctx.lineTo(-size, 0);
                ctx.closePath();
                break;
            case 'hexagon':
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
                    i === 0
                        ? ctx.moveTo(Math.cos(a) * size, Math.sin(a) * size)
                        : ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
                }
                ctx.closePath();
                break;
            case 'triangle':
                ctx.moveTo(0, -size);
                ctx.lineTo(size, size);
                ctx.lineTo(-size, size);
                ctx.closePath();
                break;
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
            // Flame trail
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fillStyle   = '#ff2200';
            ctx.fill();
            ctx.strokeStyle = '#ffaa00';
            ctx.lineWidth   = 1;
            ctx.stroke();
            // Bright core
            ctx.beginPath();
            ctx.arc(0, 0, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.restore();
        }
    },

    // ── Launch Rockets ────────────────────────────────────────────────────────

    _drawRockets(rockets) {
        const ctx = this.ctx;
        for (const r of rockets) {
            if (!r.alive) continue;
            ctx.save();
            ctx.translate(r.x, r.y);
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fillStyle   = '#88ffdd';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 0.8;
            ctx.stroke();
            // Exhaust trail
            ctx.beginPath();
            const dx = r.x - r.startX, dy = r.y - r.startY;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
                const nx = dx / len, ny = dy / len;
                ctx.moveTo(0, 0);
                ctx.lineTo(-nx * 12, -ny * 12);
                ctx.strokeStyle = 'rgba(136,255,221,0.4)';
                ctx.lineWidth   = 1.5;
                ctx.stroke();
            }
            ctx.restore();
        }
    },

    // ── Selection Highlight ───────────────────────────────────────────────────

    _drawSelectionHighlight(sat) {
        if (!sat || !sat.alive) return;
        const ctx = this.ctx;
        // Pulsing ring
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
        ctx.beginPath();
        ctx.arc(sat.x, sat.y, 14 + pulse * 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,100,${0.3 + pulse * 0.2})`;
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        // Line to orbit ring label
        ctx.beginPath();
        ctx.moveTo(sat.x, sat.y);
        ctx.lineTo(sat.x * 1.08, sat.y * 1.08);
        ctx.strokeStyle = 'rgba(255,255,100,0.4)';
        ctx.lineWidth   = 0.7;
        ctx.stroke();
    },

    // ── Comms Lines ───────────────────────────────────────────────────────────

    _drawCommsLines(game) {
        const ctx = this.ctx;
        const selected = game.selectedSat;
        if (!selected || !selected.alive) return;

        // Draw comms path from selected sat back to a ground station
        const gs = game.groundStations.find(g => Comms._groundCanReach(g, selected));
        if (gs) {
            ctx.beginPath();
            ctx.moveTo(selected.x, selected.y);
            ctx.lineTo(gs.x, gs.y);
            ctx.strokeStyle = 'rgba(100,255,150,0.35)';
            ctx.lineWidth   = 1;
            ctx.setLineDash([4, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Show relay links
        const relays = game.satellites.filter(s => s.type === 'relay' && s.alive && s.inComms);
        for (const relay of relays) {
            if (Comms._relayCanReach(relay, selected)) {
                ctx.beginPath();
                ctx.moveTo(selected.x, selected.y);
                ctx.lineTo(relay.x, relay.y);
                ctx.strokeStyle = 'rgba(255,220,60,0.3)';
                ctx.lineWidth   = 1;
                ctx.setLineDash([3, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    },

    // ── HUD ───────────────────────────────────────────────────────────────────

    _drawHUD(game) {
        const ctx = this.ctx;
        const W   = this.canvas.width;
        const H   = this.canvas.height;

        // Top bar
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, W, 36);

        ctx.fillStyle = '#44ccff';
        ctx.font      = '13px "Share Tech Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`₡ ${Utils.formatMoney(game.money)}`, 12, 22);

        ctx.fillStyle = '#ffdd44';
        ctx.fillText(`SCORE: ${Utils.formatMoney(game.score)}`, 180, 22);

        ctx.fillStyle = '#aaffaa';
        ctx.fillText(`UTIL-SATS: ${game.utilitySats.length}`, 380, 22);

        ctx.fillStyle = '#88ffdd';
        const elapsed = Math.floor(game.time);
        const min = Math.floor(elapsed / 60), sec = elapsed % 60;
        ctx.fillText(`TIME: ${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`, 560, 22);

        ctx.fillStyle = '#ff6666';
        ctx.fillText(`THREATS: ${game.enemySats.length}`, 720, 22);

        // Ground stations count
        ctx.fillStyle = '#aaffcc';
        ctx.textAlign = 'right';
        ctx.fillText(`GS: ${game.groundStations.length}/${CONFIG.GROUND_STATION_UNLOCKS.length}`, W - 10, 22);

        // Message log (bottom-left)
        const msgBox = { x: 8, y: H - 8, lineH: 16 };
        const msgs   = game.messages.slice().reverse();
        msgs.forEach((m, i) => {
            const age   = game.time - (m.expires - CONFIG.MESSAGE_DURATION);
            const alpha = Math.min(1, Math.min(age * 4, (m.expires - game.time) * 2));
            ctx.globalAlpha = alpha;
            ctx.fillStyle   = m.color;
            ctx.font        = '10px "Share Tech Mono", monospace';
            ctx.textAlign   = 'left';
            ctx.fillText(m.text, msgBox.x, msgBox.y - i * msgBox.lineH);
        });
        ctx.globalAlpha = 1;

        // Pause indicator
        if (game.paused) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(W / 2 - 80, H / 2 - 24, 160, 48);
            ctx.fillStyle = '#ffdd44';
            ctx.font      = '20px "Share Tech Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSED', W / 2, H / 2 + 7);
        }
    },

    // ── Game-Over overlay ─────────────────────────────────────────────────────

    _drawGameOver(game) {
        const ctx = this.ctx;
        const W = this.canvas.width, H = this.canvas.height;

        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#ff2222';
        ctx.font      = '40px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION FAILED', W / 2, H / 2 - 40);

        ctx.fillStyle = '#ffffff';
        ctx.font      = '18px "Share Tech Mono", monospace';
        ctx.fillText(`Final Score: ${Utils.formatMoney(game.score)}`, W / 2, H / 2 + 10);

        ctx.fillStyle = '#aaffaa';
        ctx.font      = '14px "Share Tech Mono", monospace';
        ctx.fillText('Press R to restart', W / 2, H / 2 + 50);
    },

    // ── Helpers ───────────────────────────────────────────────────────────────

    _hexAlpha(hex, alpha) {
        // hex = '#rrggbb', returns rgba string
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    },
};

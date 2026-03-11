'use strict';

const UI = {
    game:   null,
    canvas: null,

    init(game, canvas) {
        this.game   = game;
        this.canvas = canvas;
        this._buildPanels();
        this._bindEvents();
        this.refresh();
    },

    // ── Panel Setup ──────────────────────────────────────────────────────────

    _buildPanels() {
        const lp = document.getElementById('launchPanel');
        lp.style.display = 'none';
        lp.innerHTML = this._launchPanelHTML();
        document.getElementById('btnConfirmLaunch').addEventListener('click', () => this._doLaunch());
        document.getElementById('btnCancelLaunch').addEventListener('click', () => {
            lp.style.display = 'none';
        });
    },

    _launchPanelHTML() {
        let orbitOpts = '';
        for (const key of Object.keys(CONFIG.ORBITS)) {
            if (key === 'GRAVEYARD') continue;
            orbitOpts += `<option value="${key}">${CONFIG.ORBITS[key].name}</option>`;
        }
        return `
        <div class="panel-title">🚀 LAUNCH PAYLOAD</div>
        <div class="panel-info">Ground station:</div>
        <select id="gsSelect" class="launch-sel"></select>
        <div class="panel-info" style="margin-top:6px">Orbit:</div>
        <select id="orbitSelect" class="launch-sel">${orbitOpts}</select>
        <div class="panel-info" style="margin-top:6px">Payload:</div>
        <select id="payloadSelect" class="launch-sel">
          <option value="utility">Utility  (₡${Utils.formatMoney(CONFIG.ROCKET_COST+CONFIG.PAYLOAD_COSTS.utility)})</option>
          <option value="rpo">RPO Defender  (₡${Utils.formatMoney(CONFIG.ROCKET_COST+CONFIG.PAYLOAD_COSTS.rpo)})</option>
          <option value="relay">Relay  (₡${Utils.formatMoney(CONFIG.ROCKET_COST+CONFIG.PAYLOAD_COSTS.relay)})</option>
          <option value="maintenance">Maintenance  (₡${Utils.formatMoney(CONFIG.ROCKET_COST+CONFIG.PAYLOAD_COSTS.maintenance)})</option>
        </select>
        <div id="launchCostPreview" class="panel-info" style="color:#ffdd44;margin-top:4px"></div>
        <button id="btnConfirmLaunch" class="taskBtn green-btn" style="margin-top:8px;width:100%">✓ CONFIRM LAUNCH</button>
        <button id="btnCancelLaunch"  class="taskBtn red-btn"   style="margin-top:3px;width:100%">✗ Cancel</button>`;
    },

    // ── Event Binding ────────────────────────────────────────────────────────

    _bindEvents() {
        this.canvas.addEventListener('click', e => this._onCanvasClick(e));
        this.canvas.addEventListener('wheel', e => this._onWheel(e));
        window.addEventListener('keydown', e => this._onKey(e));
        document.getElementById('btnLaunch').addEventListener('click', () => this._toggleLaunch());
        document.getElementById('btnScenario').addEventListener('click', () => {
            const id = document.getElementById('scenarioSelect').value;
            this.game.selectedSat = null;
            loadScenario(this.game, id);
            this.refresh();
        });

        document.getElementById('launchPanel').addEventListener('change', () => this._updateLaunchPreview());
    },

    _onWheel(e) {
        e.preventDefault();
        if (e.deltaY < 0) this.game.zoomIn();
        else              this.game.zoomOut();
    },

    _onCanvasClick(e) {
        const rect  = this.canvas.getBoundingClientRect();
        const sx    = this.canvas.width  / rect.width;
        const sy    = this.canvas.height / rect.height;
        const cx    = this.canvas.width  / 2;
        const cy    = this.canvas.height / 2;
        // Account for zoom
        const wx    = ((e.clientX - rect.left) * sx - cx) / this.game.zoom;
        const wy    = ((e.clientY - rect.top)  * sy - cy) / this.game.zoom;
        const sat   = this.game.findSatNear(wx, wy, 22 / this.game.zoom);
        this.game.selectedSat = (this.game.selectedSat === sat) ? null : (sat || null);
        this.refresh();
    },

    _onKey(e) {
        const g = this.game;
        switch (e.key.toLowerCase()) {
            case ' ': case 'p':
                e.preventDefault();
                g.paused = !g.paused;
                break;
            case 'tab':
                e.preventDefault();
                this._cycleSelection(e.shiftKey ? -1 : 1, false);
                break;
            case '.':
                this._cycleSelection(1, false);
                break;
            case ',':
                this._cycleSelection(-1, false);
                break;
            case 'e':
                this._cycleSelection(1, true);
                break;
            case 'q':
                this._cycleSelection(-1, true);
                break;
            case 'escape':
                g.selectedSat = null;
                this.refresh();
                break;
            case 'c':
                g.showCoverage = !g.showCoverage;
                break;
            case 't':
                g.showThreats = !g.showThreats;
                break;
            case 'r':
                if (g.gameOver) window.location.reload();
                break;
            case 'n':
                if (g.gameOver) {
                    const ids  = Object.keys(SCENARIOS);
                    const cur  = ids.indexOf(g.scenario ? g.scenario.id : 'scenario_01');
                    const next = ids[(cur + 1) % ids.length];
                    loadScenario(g, next);
                    g.selectedSat = null;
                    this.refresh();
                }
                break;
            case '+': case '=':
                g.zoomIn();
                break;
            case '-': case '_':
                g.zoomOut();
                break;
        }
    },

    // ── Tick ─────────────────────────────────────────────────────────────────

    tick() {
        const sel = this.game.selectedSat;
        if (sel && !sel.alive) {
            this.game.selectedSat = null;
            this.refresh();
        }
    },

    // ── Refresh Right Panel ──────────────────────────────────────────────────

    refresh() {
        const sat   = this.game.selectedSat;
        const panel = document.getElementById('taskPanel');
        panel.innerHTML = sat && sat.alive
            ? this._satInfoHTML(sat) + this._tasksHTML(sat) + this._catalogHTML()
            : this._noSelHTML() + this._catalogHTML();
        this._bindCatalogBtns();
    },

    // ── No-selection panel ────────────────────────────────────────────────────

    _noSelHTML() {
        const sc = this.game.scenario;
        const obj = sc && sc.objectives.length > 0 ? sc.objectives[0] : null;
        const player = this.game.playerSatellites;
        const utils = player.filter(s => s.type === 'utility').length;
        const relays = player.filter(s => s.type === 'relay').length;
        const rpos = player.filter(s => s.type === 'rpo').length;
        const maint = player.filter(s => s.type === 'maintenance').length;
        const inSun = player.filter(s => s.inSunlight).length;
        const sec = Math.floor(this.game.time);
        const mm  = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss  = String(sec % 60).padStart(2, '0');
        const net = this.game.lastNetIncome;
        const sunDeg = Math.floor((Utils.normalizeAngle(this.game.sunAngle) * 180) / Math.PI);
        return `
        <div class="panel-title">RPO COMMAND</div>
        ${obj ? `<div class="panel-info obj-box">📋 ${obj.label}</div>` : ''}
        <div class="panel-hint">Click or catalog-select a satellite to inspect and command it.</div>
        <hr class="phr"/>
        <div class="panel-sub">SIM SNAPSHOT</div>
        <div class="panel-info">Mission clock: <b>${mm}:${ss}</b></div>
        <div class="panel-info">Net flow: <span class="${net >= 0 ? 'green' : 'red'}"><b>${net >= 0 ? '+' : ''}${net.toFixed(1)}/s</b></span></div>
        <div class="panel-info">Constellation: <b>${player.length}</b> (${utils} UTI / ${rpos} RPO / ${relays} REL / ${maint} MNT)</div>
        <div class="panel-info">Hazards: <span class="orange">${this.game.debris.length} debris</span> / <span class="red">${this.game.enemySats.length + this.game.asats.length} hostile</span></div>
        <div class="panel-info">Solar geometry: <b>${sunDeg}°</b> sun angle — <b>${inSun}/${player.length || 0}</b> sats in sunlight</div>
        <hr class="phr"/>
        <div class="panel-sub">LEGEND</div>
        <div class="panel-legend">
          <div><span class="ico ut"></span> Utility Sat — generates income</div>
          <div><span class="ico rp"></span> RPO Defender — intercept / escort</div>
          <div><span class="ico rl"></span> Relay Sat — extends comms</div>
          <div><span class="ico mn"></span> Maintenance Sat — refuel / defend</div>
          <div><span class="ico en"></span> Enemy RPO Sat</div>
        </div>
        <hr class="phr"/>
        <div class="panel-sub">CONTROLS</div>
        <div class="panel-hint">
          [C] Toggle coverage overlay<br/>
          [T] Toggle threat arrows<br/>
          [Tab]/[Shift+Tab] Cycle all sats<br/>
          [,]/[.] Cycle all sats<br/>
          [Q]/[E] Cycle friendlies<br/>
          [+/-] Zoom in/out<br/>
          [Mouse wheel] Zoom
        </div>
        <hr class="phr"/>
        <div class="panel-hint">[Space]/[P] Pause &nbsp; [Esc] Deselect</div>`;
    },

    // ── Satellite info ────────────────────────────────────────────────────────

    _satInfoHTML(sat) {
        const factionColor = sat.faction === 'player' ? 'green' : 'red';
        const factionLabel = sat.faction === 'player' ? 'FRIENDLY' : 'ENEMY';
        const commsColor   = sat.inComms ? 'green' : 'orange';
        const commsLabel   = sat.inComms ? 'IN COMMS' : 'OUT OF COMMS';
        const taskLabel    = sat.task    ? sat.task.type.toUpperCase() : 'NONE';
        const dvWarn       = sat.deltaVWarning;
        const dvColor      = dvWarn === 'critical' ? 'red' : dvWarn === 'low' ? 'orange' : 'cyan';
        const dvPct        = Math.round(sat.deltaVPct * 100);
        const thr          = CONFIG.THRUSTER_CLASSES[sat.thrusterClass] || {};

        const dvBar = `<div class="dv-bar-outer"><div class="dv-bar-fill dv-${dvWarn}" style="width:${dvPct}%"></div></div>`;

        const warnMsg = dvWarn === 'critical'
            ? `<div class="warn-crit">⚠ CRITICAL ΔV — maneuvers blocked!</div>`
            : dvWarn === 'low'
            ? `<div class="warn-low">⚠ Low ΔV — limited maneuvers</div>`
            : '';

        const svcPct = sat.serviceValue !== undefined ? Math.round(sat.serviceValue * 100) : 100;
        const svcRow = sat.type === 'utility'
            ? `<div class="panel-info">Service: <b style="color:#44ff88">${svcPct}%</b>${sat.safeMode ? ' <span style="color:#88ccff">[SAFE]</span>' : ''}</div>`
            : '';

        // Power info
        const batPct = Math.round(sat.batteryPct * 100);
        const batColor = sat.noPower ? 'red' : sat.lowPower ? 'orange' : '#ffee44';
        const sunLabel = sat.inSunlight ? '☀ SUN' : '🌑 ECLIPSE';
        const powerRow = sat.faction === 'player'
            ? `<div class="panel-info">Power: <span style="color:${batColor}"><b>${batPct}%</b></span> ${sunLabel}</div>`
            : '';

        // Sub-level info
        const subRow = sat.faction === 'player'
            ? `<div class="panel-info">Sub-level: <b>${sat.subLevel}</b> / ${CONFIG.SUB_LEVELS}</div>`
            : '';

        // Transfer info
        const transferRow = sat.transferring
            ? `<div class="panel-info" style="color:#ffdd44">⟳ TRANSFERRING → ${sat.transferTarget ? sat.transferTarget.name : '?'} (${Math.round(sat.transferProgress * 100)}%)</div>`
            : '';
        const driftDegPerMin = ((sat.angularVelocity * 180 / Math.PI) * 60).toFixed(2);
        const cooldownRow = sat.maneuverCooldown > 0
            ? `<div class="panel-info">Maneuver cooldown: <b style="color:#ffaa44">${sat.maneuverCooldown.toFixed(1)}s</b></div>`
            : '<div class="panel-info">Maneuver cooldown: <b class="green">READY</b></div>';

        return `
        <div class="panel-title">SAT-${sat.id} — ${sat.type.toUpperCase()}</div>
        <div class="panel-info">Orbit: <b>${sat.orbit.name}</b></div>
        <div class="panel-info">Track radius: <b>${Math.round(sat.effectiveRadius)}</b> u</div>
        <div class="panel-info">Angular drift: <b>${driftDegPerMin}°/min</b></div>
        ${subRow}
        <div class="panel-info">Faction: <span class="${factionColor}"><b>${factionLabel}</b></span></div>
        <div class="panel-info">Comms: <span class="${commsColor}">${commsLabel}</span></div>
        <div class="panel-info">Health: <b>${Math.max(0, Math.floor(sat.health))}%</b></div>
        ${svcRow}
        ${powerRow}
        ${cooldownRow}
        <div class="panel-info">Task: <span class="cyan">${taskLabel}</span></div>
        ${transferRow}
        <hr class="phr"/>
        <div class="panel-sub">PROPULSION — ${thr.label || '?'}</div>
        <div class="panel-info">ΔV: <span class="${dvColor}"><b>${Math.floor(sat.deltaV)} / ${sat.deltaVCapacity}</b></span></div>
        ${dvBar}
        ${warnMsg}
        <hr class="phr"/>`;
    },

    // ── Task Buttons ──────────────────────────────────────────────────────────

    _tasksHTML(sat) {
        if (sat.faction === 'enemy') {
            return `<div class="panel-hint">Enemy satellite — no tasks available.</div>`;
        }
        if (!sat.inComms) {
            return `<div class="panel-hint warn">⚠ Out of comms range.<br/>Deploy a relay to extend coverage.</div>`;
        }
        if (sat.noPower) {
            return `<div class="panel-hint warn">⚠ No power — satellite is dark.<br/>Wait for sunlight to recharge.</div>`;
        }

        let html = '<div class="panel-sub">AVAILABLE ORDERS</div>';

        // ── Orbit Control (all player sats) ─────────────────────────────────
        html += '<div class="panel-sub" style="color:#88ccff">ORBIT CONTROL</div>';
        html += this._btn('raise_orbit', null, '⬆ Raise Sub-Level', sat,
            `Move to sub-level ${Math.min(CONFIG.SUB_LEVELS, sat.subLevel + 1)} [ΔV: ${CONFIG.DELTA_V_COSTS.raise_orbit}]`,
            CONFIG.DELTA_V_COSTS.raise_orbit,
            sat.subLevel >= CONFIG.SUB_LEVELS);
        html += this._btn('lower_orbit', null, '⬇ Lower Sub-Level', sat,
            `Move to sub-level ${Math.max(1, sat.subLevel - 1)} [ΔV: ${CONFIG.DELTA_V_COSTS.lower_orbit}]`,
            CONFIG.DELTA_V_COSTS.lower_orbit,
            sat.subLevel <= 1);

        // Hohmann transfer options
        if (!sat.transferring) {
            html += '<div class="panel-sub" style="color:#ffdd44">HOHMANN TRANSFER</div>';
            const costs = CONFIG.HOHMANN_COSTS[sat.orbit.key];
            if (costs) {
                for (const targetKey of Object.keys(costs)) {
                    if (targetKey === sat.orbit.key) continue;
                    const targetOrbit = CONFIG.ORBITS[targetKey];
                    if (!targetOrbit) continue;
                    const cost = costs[targetKey];
                    html += this._btn('hohmann_transfer', targetKey,
                        `⟳ Transfer → ${targetOrbit.name}`,
                        sat,
                        `Hohmann maneuver [ΔV: ${cost}]`,
                        cost);
                }
            }
        }

        // ── Type-specific tasks ─────────────────────────────────────────────
        if (sat.type === 'utility') {
            html += '<div class="panel-sub" style="color:#44ccff">UTILITY ORDERS</div>';
            html += this._btn('emergency_dodge', null, '⚡ Emergency Dodge', sat,
                `Shift orbit to escape threat [ΔV: ${CONFIG.DELTA_V_COSTS.emergency_dodge}]`,
                CONFIG.DELTA_V_COSTS.emergency_dodge);
            html += this._btn('safe_mode', null,
                sat.safeMode ? '🔒 Exit Safe Mode' : '🛡 Enter Safe Mode',
                sat, 'Reduces income 20% — improves survivability [ΔV: 0]', 0);
        }

        if (sat.type === 'rpo') {
            const enemies = this.game.enemySats;
            if (enemies.length > 0) {
                html += '<div class="panel-sub" style="color:#ff8888">INTERCEPT ENEMY</div>';
                enemies.forEach(en => {
                    const d = Math.round(Utils.dist(sat.x, sat.y, en.x, en.y));
                    html += this._btn('intercept', en.id,
                        `⚔ Intercept ENE-${en.id}`,
                        sat,
                        `${en.orbit.name} — dist ${d}px [ΔV: ${CONFIG.DELTA_V_COSTS.intercept} + drain]`,
                        CONFIG.DELTA_V_COSTS.intercept);
                });
            }

            const utils = this.game.utilitySats;
            if (utils.length > 0) {
                html += '<div class="panel-sub" style="color:#44ccff">ESCORT FRIENDLY</div>';
                utils.forEach(u => {
                    html += this._btn('escort', u.id,
                        `🛡 Escort UTI-${u.id}`,
                        sat,
                        `${u.orbit.name} [ΔV: ${CONFIG.DELTA_V_COSTS.escort_start} + drain]`,
                        CONFIG.DELTA_V_COSTS.escort_start);
                });
            }

            if (enemies.length > 0) {
                html += '<div class="panel-sub" style="color:#ffaa44">BODY BLOCK</div>';
                enemies.forEach(en => {
                    html += this._btn('body_block', en.id,
                        `🚧 Body-block ENE-${en.id}`,
                        sat,
                        `Aggressive interposition [ΔV: ${CONFIG.DELTA_V_COSTS.body_block} + drain]`,
                        CONFIG.DELTA_V_COSTS.body_block);
                });
            }

            if (sat.task) {
                html += this._btn('return', null, '↩ Return to Patrol', sat,
                    'Cancel current task [ΔV: 0]', 0);
            }
        }

        if (sat.type === 'maintenance') {
            // Refuel targets: any player satellite with < full delta-V
            const refuelTargets = this.game.playerSatellites.filter(
                s => s.id !== sat.id && s.deltaV < s.deltaVCapacity
            );
            if (refuelTargets.length > 0) {
                html += '<div class="panel-sub" style="color:#88ffdd">REFUEL TARGET</div>';
                refuelTargets.forEach(t => {
                    const dvPct = Math.round(t.deltaVPct * 100);
                    html += this._btn('refuel', t.id,
                        `🔧 Refuel ${t.type.toUpperCase()}-${t.id}`,
                        sat,
                        `ΔV: ${Math.floor(t.deltaV)}/${t.deltaVCapacity} (${dvPct}%) [ΔV: ${CONFIG.DELTA_V_COSTS.refuel}]`,
                        CONFIG.DELTA_V_COSTS.refuel);
                });
            }

            // Defend targets: player utility sats
            const defendTargets = this.game.utilitySats;
            if (defendTargets.length > 0) {
                html += '<div class="panel-sub" style="color:#44ff88">DEFEND TARGET</div>';
                defendTargets.forEach(t => {
                    html += this._btn('defend', t.id,
                        `🛡 Defend UTI-${t.id}`,
                        sat,
                        `${t.orbit.name} — station nearby [ΔV: ${CONFIG.DELTA_V_COSTS.refuel} + drain]`,
                        CONFIG.DELTA_V_COSTS.refuel);
                });
            }

            if (sat.task) {
                html += this._btn('return', null, '↩ Return to Standby', sat,
                    'Cancel current task [ΔV: 0]', 0);
            }
        }

        if (sat.type === 'relay') {
            html += `<div class="panel-hint">Relay sats extend comms automatically.<br/>ΔV: ${Math.floor(sat.deltaV)}/${sat.deltaVCapacity} (reserve for repositioning).</div>`;
        }

        // ── Jammer section (shown for all player sats as context) ───────────
        if (this.game.groundStations.length > 0) {
            html += '<hr class="phr"/>';
            html += '<div class="panel-sub" style="color:#ff88ff">GROUND JAMMERS</div>';
            this.game.groundStations.forEach(gs => {
                const canJam = gs.jamCooldown <= 0 && this.game.money >= CONFIG.JAM_COST;
                const cooldownStr = gs.jamCooldown > 0 ? ` (${Math.ceil(gs.jamCooldown)}s)` : '';
                const activeStr = gs.jamActive ? ' [ACTIVE]' : '';
                html += `<button class="taskBtn jam-btn" data-gs-id="${gs.id}" ${!canJam ? 'disabled' : ''}>
                    <span class="btn-label">📡 Jam from ${gs.name}${activeStr}</span>
                    <span class="btn-sub">₡${CONFIG.JAM_COST} — disrupts enemy comms${cooldownStr}</span>
                </button>`;
            });
        }

        setTimeout(() => {
            this._bindTaskBtns(sat);
            this._bindJamBtns();
        }, 0);
        return html;
    },

    _btn(action, targetId, label, sat, subtitle, cost, forceDisabled) {
        const affordable = sat.canAfford(cost);
        const disabled   = !affordable || forceDisabled ? 'disabled title="Insufficient ΔV or unavailable"' : '';
        const cls        = !affordable || forceDisabled ? 'taskBtn cant-afford' : 'taskBtn';
        const data       = targetId !== null ? `data-target="${targetId}"` : '';
        const postDV     = affordable && !forceDisabled
            ? `<span class="btn-post-dv">→ ΔV ${Math.floor(sat.deltaV - cost)}/${sat.deltaVCapacity}</span>`
            : `<span class="btn-post-dv warn-crit">✗ Need ΔV ${cost}</span>`;
        return `
        <button class="${cls}" data-action="${action}" ${data} ${disabled}>
          <span class="btn-label">${label}</span>
          <span class="btn-sub">${subtitle}</span>
          ${postDV}
        </button>`;
    },

    _bindTaskBtns(sat) {
        const panel = document.getElementById('taskPanel');
        panel.querySelectorAll('.taskBtn:not(.cant-afford):not(.jam-btn)').forEach(btn => {
            btn.addEventListener('click', () => {
                const action   = btn.dataset.action;
                const targetId = btn.dataset.target || null;
                // For hohmann_transfer, targetId is an orbit key (string)
                // For other actions, it's an integer sat ID
                const parsed = action === 'hohmann_transfer' ? targetId
                    : (targetId ? parseInt(targetId) : null);
                this.game.taskSatellite(sat, action, parsed);
                this.refresh();
            });
        });
    },

    _bindJamBtns() {
        const panel = document.getElementById('taskPanel');
        panel.querySelectorAll('.jam-btn:not(:disabled)').forEach(btn => {
            btn.addEventListener('click', () => {
                const gsId = parseInt(btn.dataset.gsId);
                this.game.activateJammer(gsId);
                this.refresh();
            });
        });
    },

    // ── Launch Panel ──────────────────────────────────────────────────────────

    _toggleLaunch() {
        const lp = document.getElementById('launchPanel');
        const open = lp.style.display !== 'none';
        lp.style.display = open ? 'none' : 'block';
        if (!open) {
            const sel = document.getElementById('gsSelect');
            sel.innerHTML = '';
            this.game.groundStations.forEach(gs => {
                const o = document.createElement('option');
                o.value = gs.id;
                o.textContent = `${gs.name} [${gs.availableSlots}/${gs.launchSlots} slots]`;
                sel.appendChild(o);
            });
            this._updateLaunchPreview();
        }
    },

    _updateLaunchPreview() {
        const pay  = document.getElementById('payloadSelect');
        const prev = document.getElementById('launchCostPreview');
        if (!pay || !prev) return;
        const payType = pay.value;
        const cost    = CONFIG.ROCKET_COST + (CONFIG.PAYLOAD_COSTS[payType] || 0);
        const can     = this.game.money >= cost;
        prev.textContent = `Total cost: ₡${Utils.formatMoney(cost)} — Balance after: ₡${Utils.formatMoney(this.game.money - cost)}`;
        prev.style.color = can ? '#ffdd44' : '#ff4444';
        const btn = document.getElementById('btnConfirmLaunch');
        if (btn) btn.disabled = !can;
    },

    _doLaunch() {
        const gsId    = parseInt(document.getElementById('gsSelect').value);
        const orbit   = document.getElementById('orbitSelect').value;
        const payload = document.getElementById('payloadSelect').value;
        const station = this.game.groundStations.find(g => g.id === gsId);
        if (!station) return;
        if (this.game.launchRocket(station, payload, orbit)) {
            document.getElementById('launchPanel').style.display = 'none';
        }
        this.refresh();
    },

    _catalogHTML() {
        const sats = this.game.satellites
            .filter(s => s.alive)
            .sort((a, b) => {
                if (a.faction !== b.faction) return a.faction === 'player' ? -1 : 1;
                if (a.type !== b.type) return a.type.localeCompare(b.type);
                return a.id - b.id;
            });
        if (sats.length === 0) return '';
        const rows = sats.map(s => {
            const isSel = this.game.selectedSat && this.game.selectedSat.id === s.id;
            const tag = `${s.faction === 'player' ? 'FR' : 'EN'} · ${s.type.slice(0, 4).toUpperCase()}`;
            const warn = s.faction === 'player' && (s.noPower || !s.inComms || s.deltaVWarning !== 'ok');
            return `<button class="catalog-btn ${isSel ? 'is-selected' : ''}" data-sat-id="${s.id}">
                <span>SAT-${s.id} <span class="${s.faction === 'player' ? 'green' : 'red'}">${tag}</span></span>
                <span class="${warn ? 'orange' : 'panel-hint'}">${s.orbit.key}</span>
            </button>`;
        }).join('');
        return `
            <hr class="phr"/>
            <div class="panel-sub">SAT CATALOG</div>
            <div class="panel-hint">[Tab]/[,]/[.] all &nbsp; [Q]/[E] friendly</div>
            <div class="catalog-list">${rows}</div>`;
    },

    _bindCatalogBtns() {
        const panel = document.getElementById('taskPanel');
        panel.querySelectorAll('.catalog-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const satId = parseInt(btn.dataset.satId);
                const sat = this.game.satellites.find(s => s.id === satId && s.alive) || null;
                this.game.selectedSat = sat;
                this.refresh();
            });
        });
    },

    _cycleSelection(direction, friendlyOnly) {
        const sats = this.game.satellites
            .filter(s => s.alive && (!friendlyOnly || s.faction === 'player'))
            .sort((a, b) => a.id - b.id);
        if (sats.length === 0) return;
        const selectedId = this.game.selectedSat ? this.game.selectedSat.id : null;
        const idx = sats.findIndex(s => s.id === selectedId);
        const nextIdx = idx === -1
            ? (direction > 0 ? 0 : sats.length - 1)
            : (idx + direction + sats.length) % sats.length;
        this.game.selectedSat = sats[nextIdx];
        this.refresh();
    },
};

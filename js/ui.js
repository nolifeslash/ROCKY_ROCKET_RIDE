'use strict';

/**
 * UI — handles the side-panel, tasking controls, launch dialog,
 *       and all canvas click / keyboard events.
 */
const UI = {
    game:    null,
    canvas:  null,
    panel:   null,   // right-side task panel DOM element

    init(game, canvas) {
        this.game   = game;
        this.canvas = canvas;
        this.panel  = document.getElementById('taskPanel');

        this._bindEvents();
        this._buildLaunchPanel();
        this.refresh();
    },

    // ── Event Binding ─────────────────────────────────────────────────────────

    _bindEvents() {
        // Canvas click → select satellite
        this.canvas.addEventListener('click', e => this._onCanvasClick(e));

        // Keyboard
        window.addEventListener('keydown', e => this._onKey(e));

        // Launch panel button
        document.getElementById('btnLaunch').addEventListener('click', () => {
            this._toggleLaunchPanel();
        });
    },

    _onCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width  / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const cx = this.canvas.width  / 2;
        const cy = this.canvas.height / 2;

        // World coordinates
        const wx = (e.clientX - rect.left) * scaleX - cx;
        const wy = (e.clientY - rect.top)  * scaleY - cy;

        const sat = this.game.findSatNear(wx, wy, 22);
        if (sat) {
            this.game.selectedSat = (this.game.selectedSat === sat) ? null : sat;
        } else {
            this.game.selectedSat = null;
        }
        this.refresh();
    },

    _onKey(e) {
        switch (e.key.toLowerCase()) {
            case 'p': case ' ':
                e.preventDefault();
                this.game.paused = !this.game.paused;
                break;
            case 'escape':
                this.game.selectedSat = null;
                this.refresh();
                break;
            case 'r':
                if (this.game.gameOver) {
                    // Restart
                    window.location.reload();
                }
                break;
        }
    },

    // ── Task Panel ────────────────────────────────────────────────────────────

    refresh() {
        const sat = this.game.selectedSat;
        const panel = this.panel;

        if (!sat || !sat.alive) {
            panel.innerHTML = this._noSelectionHTML();
            return;
        }

        panel.innerHTML = this._satInfoHTML(sat) + this._taskButtonsHTML(sat);

        // Bind task buttons
        const g = this.game;
        const btns = panel.querySelectorAll('.taskBtn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                const action   = btn.dataset.action;
                const targetId = parseInt(btn.dataset.target) || null;
                g.taskSatellite(sat, action, targetId);
                this.refresh();
            });
        });
    },

    _noSelectionHTML() {
        return `
        <div class="panel-title">RPO COMMAND</div>
        <div class="panel-hint">Click a satellite to select it.</div>
        <hr class="panel-hr"/>
        <div class="panel-legend">
          <div><span class="icon util"></span> Utility Sat (generates income)</div>
          <div><span class="icon rpo"></span> RPO Sat (intercept / escort)</div>
          <div><span class="icon relay"></span> Relay Sat (extends comms)</div>
          <div><span class="icon enemy"></span> Enemy RPO Sat</div>
        </div>
        <hr class="panel-hr"/>
        <div class="panel-hint">
          <kbd>Space</kbd> / <kbd>P</kbd> — Pause<br/>
          <kbd>Esc</kbd> — Deselect
        </div>`;
    },

    _satInfoHTML(sat) {
        const faction = sat.faction === 'player' ? '<span class="green">FRIENDLY</span>' : '<span class="red">ENEMY</span>';
        const comms   = sat.inComms
            ? '<span class="green">IN COMMS</span>'
            : '<span class="orange">OUT OF COMMS</span>';
        const task    = sat.task
            ? `<span class="cyan">${sat.task.type.toUpperCase()}</span>`
            : '<span class="dim">none</span>';
        return `
        <div class="panel-title">SATELLITE ${sat.id}</div>
        <div class="panel-info">Type: <b>${sat.type.toUpperCase()}</b></div>
        <div class="panel-info">Orbit: <b>${sat.orbit.name}</b></div>
        <div class="panel-info">Faction: ${faction}</div>
        <div class="panel-info">Comms: ${comms}</div>
        <div class="panel-info">Health: <b>${Math.max(0,Math.floor(sat.health))}%</b></div>
        <div class="panel-info">Task: ${task}</div>
        <hr class="panel-hr"/>`;
    },

    _taskButtonsHTML(sat) {
        if (sat.faction === 'enemy') {
            return `<div class="panel-hint">Enemy satellite — cannot task.</div>`;
        }
        if (!sat.inComms) {
            return `<div class="panel-hint warn">Out of comms — cannot task.<br/>Deploy a relay satellite to extend coverage.</div>`;
        }

        let html = '<div class="panel-title">AVAILABLE TASKS</div>';

        if (sat.type === 'utility') {
            html += this._btn('evade', null, 'Evasive Maneuver', 'Shift orbit to avoid threats');
        }

        if (sat.type === 'rpo') {
            // List enemy RPO-sats as intercept targets
            const enemies = this.game.enemySats;
            if (enemies.length > 0) {
                html += '<div class="panel-subtitle">Intercept enemy:</div>';
                enemies.forEach(en => {
                    html += this._btn('intercept', en.id,
                        `Intercept #${en.id}`,
                        `on ${en.orbit.name}`);
                });
            } else {
                html += '<div class="panel-hint">No enemy satellites detected.</div>';
            }

            // Escort friendly utility sats
            const util = this.game.utilitySats;
            if (util.length > 0) {
                html += '<div class="panel-subtitle">Escort utility sat:</div>';
                util.forEach(u => {
                    html += this._btn('escort', u.id,
                        `Escort SAT #${u.id}`,
                        `on ${u.orbit.name}`);
                });
            }

            if (sat.task) {
                html += this._btn('return', null, 'Return to Patrol', '');
            }
        }

        if (sat.type === 'relay') {
            html += `<div class="panel-hint">Relay sats extend comms coverage automatically.</div>`;
        }

        return html;
    },

    _btn(action, targetId, label, subtitle) {
        const data = targetId !== null ? `data-target="${targetId}"` : '';
        return `
        <button class="taskBtn" data-action="${action}" ${data}>
          <span class="btn-label">${label}</span>
          ${subtitle ? `<span class="btn-sub">${subtitle}</span>` : ''}
        </button>`;
    },

    // ── Launch Panel ──────────────────────────────────────────────────────────

    _buildLaunchPanel() {
        const div = document.getElementById('launchPanel');
        div.style.display = 'none';

        let html = '<div class="panel-title">LAUNCH PAYLOAD</div>';
        html += '<div class="panel-info">Select ground station:</div>';
        html += '<select id="gsSelect" class="launch-select"></select>';
        html += '<div class="panel-info" style="margin-top:8px">Select orbit:</div>';
        html += '<select id="orbitSelect" class="launch-select">';
        for (const key of Object.keys(CONFIG.ORBITS)) {
            if (key === 'GRAVEYARD') continue;
            const o = CONFIG.ORBITS[key];
            html += `<option value="${key}">${o.name}</option>`;
        }
        html += '</select>';
        html += '<div class="panel-info" style="margin-top:8px">Payload type:</div>';
        html += `
          <select id="payloadSelect" class="launch-select">
            <option value="utility">Utility Sat (₡${Utils.formatMoney(CONFIG.ROCKET_COST + CONFIG.PAYLOAD_COSTS.utility)})</option>
            <option value="rpo">RPO Sat (₡${Utils.formatMoney(CONFIG.ROCKET_COST + CONFIG.PAYLOAD_COSTS.rpo)})</option>
            <option value="relay">Relay Sat (₡${Utils.formatMoney(CONFIG.ROCKET_COST + CONFIG.PAYLOAD_COSTS.relay)})</option>
          </select>`;
        html += '<button id="btnConfirmLaunch" class="taskBtn" style="margin-top:10px;width:100%">🚀 CONFIRM LAUNCH</button>';
        html += '<button id="btnCancelLaunch" class="taskBtn cancel" style="margin-top:4px;width:100%">Cancel</button>';

        div.innerHTML = html;

        document.getElementById('btnConfirmLaunch').addEventListener('click', () => {
            this._doLaunch();
        });
        document.getElementById('btnCancelLaunch').addEventListener('click', () => {
            div.style.display = 'none';
        });
    },

    _toggleLaunchPanel() {
        const div = document.getElementById('launchPanel');
        div.style.display = div.style.display === 'none' ? 'block' : 'none';

        if (div.style.display === 'block') {
            // Populate ground stations
            const sel = document.getElementById('gsSelect');
            sel.innerHTML = '';
            this.game.groundStations.forEach(gs => {
                const opt = document.createElement('option');
                opt.value = gs.id;
                opt.textContent = gs.name;
                sel.appendChild(opt);
            });
        }
    },

    _doLaunch() {
        const gsId       = parseInt(document.getElementById('gsSelect').value);
        const orbitKey   = document.getElementById('orbitSelect').value;
        const payloadType= document.getElementById('payloadSelect').value;

        const station = this.game.groundStations.find(g => g.id === gsId);
        if (!station) return;

        const ok = this.game.launchRocket(station, payloadType, orbitKey);
        if (ok) {
            document.getElementById('launchPanel').style.display = 'none';
        }
        this.refresh();
    },

    // ── Periodic refresh hook (called from main loop) ─────────────────────────

    tick() {
        // Refresh task panel if something changed (cheap check)
        const sel = this.game.selectedSat;
        if (sel && !sel.alive) {
            this.game.selectedSat = null;
            this.refresh();
        }
    },
};

'use strict';

let game;
let lastTime = null;
let speedMultiplier = 1;   // 1x / 2x / 4x

function init() {
    const canvas  = document.getElementById('gameCanvas');
    canvas.width  = CONFIG.CANVAS_WIDTH;
    canvas.height = CONFIG.CANVAS_HEIGHT;

    Renderer.init(canvas);
    game = new Game('scenario_01');
    UI.init(game, canvas);

    // Speed-control buttons
    document.getElementById('btn1x').addEventListener('click', () => { speedMultiplier = 1; _updateSpeedBtns(); });
    document.getElementById('btn2x').addEventListener('click', () => { speedMultiplier = 2; _updateSpeedBtns(); });
    document.getElementById('btn4x').addEventListener('click', () => { speedMultiplier = 4; _updateSpeedBtns(); });
    _updateSpeedBtns();

    requestAnimationFrame(loop);
}

function _updateSpeedBtns() {
    ['btn1x','btn2x','btn4x'].forEach(id => {
        const mult = parseInt(id.replace('btn','').replace('x',''));
        document.getElementById(id).classList.toggle('speed-active', mult === speedMultiplier);
    });
}

function loop(ts) {
    if (lastTime === null) lastTime = ts;
    const rawDt = Math.min((ts - lastTime) / 1000, 0.10);
    lastTime    = ts;

    // Step multiple times for 2×/4× speed while keeping physics stable
    const steps = speedMultiplier;
    const dt    = rawDt / steps;
    for (let i = 0; i < steps; i++) game.update(dt);

    Renderer.draw(game);
    UI.tick();

    requestAnimationFrame(loop);
}

window.addEventListener('DOMContentLoaded', init);

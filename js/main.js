'use strict';

let game;
let lastTime = null;

function init() {
    const canvas = document.getElementById('gameCanvas');
    canvas.width  = CONFIG.CANVAS_WIDTH;
    canvas.height = CONFIG.CANVAS_HEIGHT;

    Renderer.init(canvas);
    game = new Game();
    UI.init(game, canvas);

    requestAnimationFrame(loop);
}

function loop(timestamp) {
    if (lastTime === null) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);  // cap at 100 ms
    lastTime = timestamp;

    game.update(dt);
    Renderer.draw(game);
    UI.tick();

    requestAnimationFrame(loop);
}

window.addEventListener('DOMContentLoaded', init);

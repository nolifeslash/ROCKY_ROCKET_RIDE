'use strict';

const Utils = {
    /** Normalize angle to [0, 2π) */
    normalizeAngle(a) {
        const TAU = Math.PI * 2;
        return ((a % TAU) + TAU) % TAU;
    },

    /** Angular distance between two angles (smallest, signed) */
    angleDiff(a, b) {
        let d = Utils.normalizeAngle(b - a);
        if (d > Math.PI) d -= Math.PI * 2;
        return d;
    },

    /** Euclidean distance between two points */
    dist(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /** Linear interpolation */
    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    /** Random float in [min, max) */
    rand(min, max) {
        return min + Math.random() * (max - min);
    },

    /** Random int in [min, max] */
    randInt(min, max) {
        return Math.floor(min + Math.random() * (max - min + 1));
    },

    /** Random element from array */
    pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    },

    /** Orbital angular velocity (rad/s) given the game period (seconds) */
    angularVelocity(period) {
        return (Math.PI * 2) / period;
    },

    /** Convert world coordinates → canvas coordinates */
    worldToCanvas(wx, wy, cx, cy) {
        return { x: cx + wx, y: cy + wy };
    },

    /** Degrees → radians */
    deg2rad(d) { return d * Math.PI / 180; },

    /** Position on a circular orbit */
    orbitPos(radius, angle) {
        return {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
        };
    },

    /** Clamp value between min and max */
    clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    },

    /** Format large numbers with commas */
    formatMoney(n) {
        return Math.floor(n).toLocaleString();
    },

    /** Generate a short unique ID */
    uid: (function () {
        let counter = 0;
        return function () { return ++counter; };
    }()),
};

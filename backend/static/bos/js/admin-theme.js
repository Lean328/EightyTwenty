/*
 * Runs in <head>, before the first paint: picks the theme and the menu width
 * the reader left the workspace in, so a dark-mode reader never sees a white
 * flash and a collapsed menu does not spring open for a frame on every page.
 * Storage can throw (private windows, blocked site data); the defaults stand.
 */
(function () {
    "use strict";
    var root = document.documentElement;
    var theme = null;
    try {
        theme = window.localStorage.getItem("bos-theme");
    } catch (error) {
        theme = null;
    }
    if (theme !== "light" && theme !== "dark") {
        theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    root.setAttribute("data-theme", theme);
    try {
        if (window.localStorage.getItem("bos-nav") === "collapsed") {
            root.classList.add("bos-nav-collapsed");
        }
    } catch (error) {
        // The menu simply starts open.
    }
})();

/*
 * The EightyTwenty BOS shell: theme switch, menu, page finder, and the small
 * helpers every admin page shares (spelled-out dates, image lightbox,
 * dismissable messages, the login form niceties).
 *
 * Everything here is an enhancement. With the script blocked the menu is still
 * a list of links, forms still submit, and a thumbnail still opens its file.
 */
(function () {
    "use strict";

    var root = document.documentElement;

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
    }

    function store(key, value) {
        try {
            if (value === null) {
                window.localStorage.removeItem(key);
            } else {
                window.localStorage.setItem(key, value);
            }
        } catch (error) {
            // Private windows refuse storage; the choice lasts for this page only.
        }
    }

    function fold(text) {
        // Accent-insensitive matching, so "cafe" finds "Café".
        return (text || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "");
    }

    /* Theme: one button, two states. The reader's choice is remembered; with
       no choice made, the operating system decides (admin-theme.js). */
    function wireTheme() {
        document.querySelectorAll("[data-bos-theme-toggle]").forEach(function (button) {
            button.addEventListener("click", function () {
                var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
                root.setAttribute("data-theme", next);
                store("bos-theme", next);
            });
        });
    }

    /* Menu: a drawer under 1024px, a rail that collapses to icons above it. */
    var MOBILE = window.matchMedia("(max-width: 1023px)");

    function setDrawer(open) {
        var scrim = document.querySelector("[data-bos-close-nav]");
        var toggle = document.querySelector("[data-bos-nav-toggle]");
        document.body.classList.toggle("bos-nav-open", open);
        if (scrim) {
            scrim.hidden = !open;
        }
        if (toggle) {
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
        }
    }

    function wireMenu() {
        var toggle = document.querySelector("[data-bos-nav-toggle]");
        var collapse = document.querySelector("[data-bos-collapse]");
        var scrim = document.querySelector("[data-bos-close-nav]");

        if (toggle) {
            toggle.addEventListener("click", function () {
                setDrawer(!document.body.classList.contains("bos-nav-open"));
            });
        }
        if (scrim) {
            scrim.addEventListener("click", function () {
                setDrawer(false);
            });
        }
        if (collapse) {
            var startsCollapsed = root.classList.contains("bos-nav-collapsed");
            collapse.setAttribute("aria-label", startsCollapsed ? "Expand menu" : "Collapse menu");
            collapse.setAttribute("data-bos-tip", startsCollapsed ? "Expand menu" : "Collapse menu");
            collapse.addEventListener("click", function () {
                var collapsed = root.classList.toggle("bos-nav-collapsed");
                store("bos-nav", collapsed ? "collapsed" : null);
                collapse.setAttribute("aria-label", collapsed ? "Expand menu" : "Collapse menu");
                collapse.setAttribute("data-bos-tip", collapsed ? "Expand menu" : "Collapse menu");
            });
        }
        MOBILE.addEventListener("change", function () {
            setDrawer(false);
        });

        // Keep the open page in view when the menu is longer than the screen.
        var active = document.querySelector(".bos-nav-link.is-active");
        var nav = document.querySelector("[data-bos-nav]");
        if (active && nav && active.offsetTop > nav.clientHeight - 80) {
            nav.scrollTop = active.offsetTop - nav.clientHeight / 2;
        }
    }

    /* The account menu is a <details>; close it on a click elsewhere or Esc. */
    function wireUserMenu() {
        document.addEventListener("click", function (event) {
            document.querySelectorAll("[data-bos-menu][open]").forEach(function (menu) {
                if (!menu.contains(event.target)) {
                    menu.removeAttribute("open");
                }
            });
        });
    }

    /* Page finder (Ctrl+K): every page in the menu, filtered as you type. */
    function wirePalette() {
        var palette = document.querySelector("[data-bos-palette]");
        if (!palette) {
            return;
        }
        var input = palette.querySelector("[data-bos-palette-input]");
        var list = palette.querySelector("[data-bos-palette-list]");
        var empty = palette.querySelector("[data-bos-palette-empty]");
        var entries = [];
        var cursor = 0;
        var lastFocus = null;

        document.querySelectorAll("[data-bos-nav-link]").forEach(function (link) {
            var name = link.querySelector(".bos-nav-text").textContent.trim();
            var section = link.getAttribute("data-bos-section") || "";
            var glyph = link.querySelector("svg");
            entries.push({
                name: name,
                section: section,
                href: link.getAttribute("href"),
                icon: glyph ? glyph.outerHTML : "",
                key: fold(name + " " + section),
            });
        });

        function render() {
            var query = fold(input.value.trim());
            var matches = entries.filter(function (entry) {
                return !query || query.split(/\s+/).every(function (word) {
                    return entry.key.indexOf(word) !== -1;
                });
            });
            list.innerHTML = "";
            cursor = Math.min(cursor, Math.max(matches.length - 1, 0));
            matches.forEach(function (entry, index) {
                var item = document.createElement("li");
                item.setAttribute("role", "option");
                item.className = "bos-palette-item" + (index === cursor ? " is-on" : "");
                item.setAttribute("aria-selected", index === cursor ? "true" : "false");
                var link = document.createElement("a");
                link.href = entry.href;
                link.innerHTML = entry.icon;
                var name = document.createElement("span");
                name.textContent = entry.name;
                link.appendChild(name);
                if (entry.section) {
                    var section = document.createElement("small");
                    section.textContent = entry.section;
                    link.appendChild(section);
                }
                item.appendChild(link);
                item.addEventListener("mousemove", function () {
                    if (cursor !== index) {
                        cursor = index;
                        highlight();
                    }
                });
                list.appendChild(item);
            });
            empty.hidden = matches.length > 0;
        }

        function highlight() {
            list.querySelectorAll(".bos-palette-item").forEach(function (item, index) {
                item.classList.toggle("is-on", index === cursor);
                item.setAttribute("aria-selected", index === cursor ? "true" : "false");
                if (index === cursor) {
                    item.scrollIntoView({ block: "nearest" });
                }
            });
        }

        function open() {
            lastFocus = document.activeElement;
            palette.hidden = false;
            input.value = "";
            cursor = 0;
            render();
            input.focus();
        }

        function close() {
            palette.hidden = true;
            if (lastFocus && lastFocus.focus) {
                lastFocus.focus();
            }
        }

        document.querySelectorAll("[data-bos-palette-open]").forEach(function (button) {
            button.addEventListener("click", open);
        });
        palette.addEventListener("click", function (event) {
            if (event.target === palette) {
                close();
            }
        });
        input.addEventListener("input", function () {
            cursor = 0;
            render();
        });
        input.addEventListener("keydown", function (event) {
            var items = list.querySelectorAll(".bos-palette-item");
            if (event.key === "ArrowDown") {
                event.preventDefault();
                cursor = Math.min(cursor + 1, items.length - 1);
                highlight();
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                cursor = Math.max(cursor - 1, 0);
                highlight();
            } else if (event.key === "Enter") {
                var chosen = items[cursor] ? items[cursor].querySelector("a") : null;
                if (chosen) {
                    event.preventDefault();
                    window.location.href = chosen.href;
                }
            }
        });
        document.addEventListener("keydown", function (event) {
            var mod = event.ctrlKey || event.metaKey;
            if (mod && (event.key === "k" || event.key === "K")) {
                event.preventDefault();
                if (palette.hidden) {
                    open();
                } else {
                    close();
                }
            } else if (event.key === "Escape") {
                if (!palette.hidden) {
                    close();
                } else if (document.body.classList.contains("bos-nav-open")) {
                    setDrawer(false);
                } else {
                    document.querySelectorAll("[data-bos-menu][open]").forEach(function (menu) {
                        menu.removeAttribute("open");
                    });
                }
            }
        });
    }

    /* Dropdowns. The browser draws an open <select> itself, in the operating
       system's own grey list, and no stylesheet reaches it. Each single
       <select> gets a button and a list drawn here instead; the real element
       stays underneath, so forms submit, Django's scripts read and write it,
       and validation is untouched. Multi-selects, the two-column picker and
       autocomplete widgets keep their own controls. */
    var SELECT_SKIP = "[multiple], [size], .admin-autocomplete, .select2-hidden-accessible, [data-bos-native]";
    var CHECK_ICON = '<svg class="bos-i bos-select-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
    var CARET_ICON = '<svg class="bos-i bos-select-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 9.5 5.5 5.5 5.5-5.5"/></svg>';
    var openSelect = null;

    function optionLabel(option) {
        return option ? option.textContent.trim() : "";
    }

    function onViewportChange(event) {
        if (openSelect && event && event.type === "scroll" && openSelect.pop.contains(event.target)) {
            return;
        }
        closeSelect(false);
    }

    function closeSelect(restoreFocus) {
        if (!openSelect) {
            return;
        }
        var current = openSelect;
        openSelect = null;
        current.pop.remove();
        current.trigger.setAttribute("aria-expanded", "false");
        current.trigger.removeAttribute("aria-activedescendant");
        current.wrap.classList.remove("is-open");
        window.removeEventListener("resize", onViewportChange);
        window.removeEventListener("scroll", onViewportChange, true);
        if (restoreFocus) {
            current.trigger.focus();
        }
    }

    function placePop(state) {
        var rect = state.trigger.getBoundingClientRect();
        var pop = state.pop;
        pop.style.minWidth = Math.max(rect.width, 180) + "px";
        pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8)) + "px";
        var below = window.innerHeight - rect.bottom;
        if (below < Math.min(pop.offsetHeight, 300) + 12 && rect.top > below) {
            pop.style.top = "";
            pop.style.bottom = window.innerHeight - rect.top + 6 + "px";
            pop.classList.add("is-up");
        } else {
            pop.style.bottom = "";
            pop.style.top = rect.bottom + 6 + "px";
            pop.classList.remove("is-up");
        }
    }

    function syncTrigger(state) {
        var option = state.select.options[state.select.selectedIndex];
        state.value.textContent = optionLabel(option) || "—";
        state.trigger.disabled = state.select.disabled;
        var first = state.select.options[0];
        // A filter showing anything but its first choice ("All") is in use.
        state.wrap.classList.toggle("is-set", Boolean(option && first && option !== first));
    }

    function choose(state, option) {
        if (!option || option.disabled) {
            return;
        }
        var changed = state.select.value !== option.value;
        state.select.value = option.value;
        syncTrigger(state);
        closeSelect(true);
        if (changed) {
            state.select.dispatchEvent(new Event("input", { bubbles: true }));
            state.select.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    function openList(state) {
        closeSelect(false);
        var select = state.select;
        var pop = document.createElement("div");
        pop.className = "bos-select-pop";
        var list = document.createElement("ul");
        list.setAttribute("role", "listbox");
        list.id = "bos-listbox-" + Math.random().toString(36).slice(2, 9);
        state.trigger.setAttribute("aria-controls", list.id);

        var items = [];
        var search = null;
        if (select.options.length > 9) {
            search = document.createElement("input");
            search.type = "search";
            search.className = "bos-select-search";
            search.placeholder = "Search the list…";
            search.setAttribute("aria-label", "Search the list");
            search.setAttribute("autocomplete", "off");
            pop.appendChild(search);
        }

        function setCursor(index) {
            items.forEach(function (entry, i) {
                entry.item.classList.toggle("is-active", i === index);
            });
            state.cursor = index;
            if (items[index]) {
                state.trigger.setAttribute("aria-activedescendant", items[index].item.id);
                items[index].item.scrollIntoView({ block: "nearest" });
            }
        }

        function addOption(option) {
            var item = document.createElement("li");
            item.setAttribute("role", "option");
            item.className = "bos-select-option";
            item.id = list.id + "-" + items.length;
            if (option.disabled) {
                item.setAttribute("aria-disabled", "true");
            }
            if (option.selected) {
                item.setAttribute("aria-selected", "true");
            }
            var label = document.createElement("span");
            label.textContent = optionLabel(option) || "—";
            item.appendChild(label);
            item.insertAdjacentHTML("beforeend", CHECK_ICON);
            var entry = { item: item, option: option, key: fold(optionLabel(option)) };
            item.addEventListener("mousedown", function (event) {
                event.preventDefault();
            });
            item.addEventListener("click", function () {
                choose(state, option);
            });
            item.addEventListener("mousemove", function () {
                if (state.cursor !== items.indexOf(entry)) {
                    setCursor(items.indexOf(entry));
                }
            });
            items.push(entry);
            list.appendChild(item);
        }

        Array.prototype.forEach.call(select.children, function (node) {
            if (node.tagName === "OPTGROUP") {
                var heading = document.createElement("li");
                heading.className = "bos-select-group";
                heading.setAttribute("role", "presentation");
                heading.textContent = node.label;
                list.appendChild(heading);
                Array.prototype.forEach.call(node.children, addOption);
            } else {
                addOption(node);
            }
        });
        pop.appendChild(list);
        document.body.appendChild(pop);

        state.pop = pop;
        state.items = items;
        openSelect = state;
        state.trigger.setAttribute("aria-expanded", "true");
        state.wrap.classList.add("is-open");
        placePop(state);
        setCursor(Math.max(0, select.selectedIndex));

        function visible() {
            return items.filter(function (entry) {
                return !entry.item.hidden;
            });
        }

        function move(step) {
            var shown = visible();
            if (!shown.length) {
                return;
            }
            var at = shown.indexOf(items[state.cursor]);
            var next = shown[Math.min(Math.max(at + step, 0), shown.length - 1)];
            setCursor(items.indexOf(next));
        }

        state.keys = function (event) {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                move(1);
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                move(-1);
            } else if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                var shown = visible();
                if (shown.length) {
                    setCursor(items.indexOf(event.key === "Home" ? shown[0] : shown[shown.length - 1]));
                }
            } else if (event.key === "Enter") {
                event.preventDefault();
                if (items[state.cursor] && !items[state.cursor].item.hidden) {
                    choose(state, items[state.cursor].option);
                }
            } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeSelect(true);
            } else if (event.key === "Tab") {
                closeSelect(false);
            }
        };

        if (search) {
            search.addEventListener("input", function () {
                var query = fold(search.value.trim());
                items.forEach(function (entry) {
                    entry.item.hidden = Boolean(query) && entry.key.indexOf(query) === -1;
                });
                var shown = visible();
                if (shown.length) {
                    setCursor(items.indexOf(shown[0]));
                }
            });
            search.addEventListener("keydown", state.keys);
            search.focus();
        }

        window.addEventListener("resize", onViewportChange);
        window.addEventListener("scroll", onViewportChange, true);
    }

    function enhanceSelect(select) {
        if (select.dataset.bosSelect || select.matches(SELECT_SKIP) || select.closest(".empty-form, .selector, .bos-select")) {
            return;
        }
        select.dataset.bosSelect = "1";

        var wrap = document.createElement("span");
        wrap.className = "bos-select";
        if (select.classList.contains("bos-field")) {
            wrap.classList.add("bos-field");
        }
        if (select.classList.contains("bos-field-sm")) {
            wrap.classList.add("bos-field-sm");
        }
        if (select.hasAttribute("data-bos-filter-select") || select.hasAttribute("data-bos-select-label")) {
            wrap.classList.add("bos-select-filter");
        }

        var trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "bos-select-trigger";
        trigger.setAttribute("role", "combobox");
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");

        var prefixText = select.getAttribute("data-bos-select-label");
        var name = prefixText || select.getAttribute("aria-label");
        var label = select.id ? document.querySelector('label[for="' + select.id + '"]') : null;
        if (!name && label) {
            name = label.textContent.replace(/[:*\s]+$/, "");
        }
        if (label) {
            // The label still points at the hidden select; send its click on.
            label.addEventListener("click", function (event) {
                event.preventDefault();
                trigger.focus();
            });
        }
        if (name) {
            trigger.setAttribute("aria-label", name);
        }
        if (prefixText) {
            var prefix = document.createElement("span");
            prefix.className = "bos-select-prefix";
            prefix.textContent = prefixText;
            trigger.appendChild(prefix);
        }
        var value = document.createElement("span");
        value.className = "bos-select-value";
        trigger.appendChild(value);
        trigger.insertAdjacentHTML("beforeend", CARET_ICON);

        select.parentNode.insertBefore(wrap, select);
        wrap.appendChild(select);
        wrap.appendChild(trigger);
        select.classList.add("bos-select-native");
        select.tabIndex = -1;
        select.setAttribute("aria-hidden", "true");

        var state = { select: select, wrap: wrap, trigger: trigger, value: value };
        syncTrigger(state);

        trigger.addEventListener("click", function () {
            if (openSelect === state) {
                closeSelect(true);
            } else {
                openList(state);
            }
        });
        trigger.addEventListener("keydown", function (event) {
            if (openSelect === state) {
                state.keys(event);
                return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openList(state);
            }
        });
        // Django's own scripts (an option added from the popup, an action
        // reset) change the real select; the button follows them.
        select.addEventListener("change", function () {
            syncTrigger(state);
        });
        new MutationObserver(function () {
            syncTrigger(state);
        }).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["selected", "disabled"] });
    }

    function wireSelects(scope) {
        if (scope && scope.tagName === "SELECT") {
            enhanceSelect(scope);
            return;
        }
        (scope || document).querySelectorAll("select").forEach(enhanceSelect);
    }

    function wireSelectDismiss() {
        document.addEventListener("mousedown", function (event) {
            if (openSelect && !openSelect.pop.contains(event.target) && !openSelect.wrap.contains(event.target)) {
                closeSelect(false);
            }
        });
    }

    /* Filters above a list: each is a dropdown whose option values are the
       addresses of the filtered list, so choosing one goes there. */
    function wireFilters() {
        document.querySelectorAll("[data-bos-filter-select]").forEach(function (select) {
            select.addEventListener("change", function () {
                // Only ever a query string on this list, never another address.
                if (select.value.charAt(0) === "?") {
                    window.location.href = select.value;
                }
            });
        });
    }

    /* A small GET form (the overview's location and period) applies itself. */
    function wireAutosubmit() {
        document.querySelectorAll("form[data-bos-autosubmit]").forEach(function (form) {
            form.addEventListener("change", function () {
                form.submit();
            });
        });
    }

    /* Availability board: a cell flips in place. Without fetch (or on any
       error) the form simply posts and the page reloads at the same row. */
    function wireAvailability() {
        document.querySelectorAll("form[data-bos-toggle]").forEach(function (form) {
            form.addEventListener("submit", function (event) {
                if (!window.fetch || !window.FormData) {
                    return;
                }
                event.preventDefault();
                var button = form.querySelector(".bos-cell");
                var next = form.querySelector('[name="available"]');
                button.classList.add("is-busy");
                fetch(window.location.href, {
                    method: "POST",
                    body: new FormData(form),
                    headers: { "X-Requested-With": "fetch" },
                    credentials: "same-origin",
                })
                    .then(function (response) {
                        if (!response.ok) {
                            throw new Error(String(response.status));
                        }
                        return response.json();
                    })
                    .then(function (data) {
                        var cell = data.cells[0];
                        button.className = "bos-cell is-" + cell.state;
                        button.textContent = cell.label;
                        next.value = cell.state === "on" ? "0" : "1";
                        button.setAttribute("aria-label", button.getAttribute("aria-label").replace(/: [^.]+\./, ": " + cell.label + "."));
                    })
                    .catch(function () {
                        form.submit();
                    });
            });
        });
    }

    /* A change form split into tabs, one per fieldset and one per inline:
       the page shows one part at a time instead of a long scroll. The tab
       with the first error opens first; otherwise the last tab used on this
       record. Without the script every part simply shows, one under another. */
    function wireTabs() {
        var form = document.querySelector(".change-form #content-main form");
        if (!form || document.body.classList.contains("popup")) {
            return;
        }
        // The csrf input comes first; the parts live in the div after it.
        var holder = form.querySelector(":scope > div");
        if (!holder) {
            return;
        }
        var panels = Array.prototype.filter.call(holder.children, function (node) {
            return node.matches("fieldset.module, .inline-group") && !node.matches(".hidden");
        });
        if (panels.length < 2) {
            return;
        }

        var bar = document.createElement("div");
        bar.className = "bos-tabs";
        bar.setAttribute("role", "tablist");
        bar.setAttribute("aria-label", "Record sections");
        var tabs = [];

        panels.forEach(function (panel, index) {
            var heading = panel.querySelector("h2");
            var name = heading ? heading.textContent.trim() : "";
            if (!name) {
                name = index === 0 ? "Details" : "Section " + (index + 1);
            }
            if (!panel.id) {
                panel.id = "bos-panel-" + index;
            }
            panel.classList.add("bos-tab-panel");
            panel.setAttribute("role", "tabpanel");

            var tab = document.createElement("button");
            tab.type = "button";
            tab.className = "bos-tab";
            tab.setAttribute("role", "tab");
            tab.id = "bos-tab-" + index;
            tab.setAttribute("aria-controls", panel.id);
            panel.setAttribute("aria-labelledby", tab.id);
            tab.textContent = name;
            if (panel.querySelector(".errorlist, .errors")) {
                tab.classList.add("has-error");
                tab.insertAdjacentHTML("beforeend", '<span class="bos-tab-dot" aria-label="has errors"></span>');
            }
            // A tabular inline is one .inline-related holding a row per record.
            var rows = panel.querySelectorAll(
                panel.querySelector(".tabular") ? "tbody tr.form-row:not(.empty-form)" : ".inline-related:not(.empty-form)"
            ).length;
            if (panel.matches(".inline-group") && rows) {
                var count = document.createElement("span");
                count.className = "bos-tab-count";
                count.textContent = rows;
                tab.appendChild(count);
            }
            tab.addEventListener("click", function () {
                show(index, true);
            });
            tab.addEventListener("keydown", function (event) {
                var step = event.key === "ArrowRight" ? 1 : (event.key === "ArrowLeft" ? -1 : 0);
                if (step) {
                    event.preventDefault();
                    var next = (index + step + tabs.length) % tabs.length;
                    show(next, true);
                    tabs[next].focus();
                }
            });
            tabs.push(tab);
            bar.appendChild(tab);
        });

        var storeKey = "bos-tab:" + window.location.pathname;

        function show(active, remember) {
            panels.forEach(function (panel, index) {
                var on = index === active;
                panel.hidden = !on;
                tabs[index].classList.toggle("is-on", on);
                tabs[index].setAttribute("aria-selected", on ? "true" : "false");
                tabs[index].tabIndex = on ? 0 : -1;
                if (on) {
                    var details = panel.querySelector(":scope > details");
                    if (details) {
                        details.open = true;
                    }
                }
            });
            if (remember) {
                try {
                    window.sessionStorage.setItem(storeKey, String(active));
                } catch (error) {
                    // The choice simply is not remembered.
                }
            }
        }

        holder.insertBefore(bar, panels[0]);
        document.body.classList.add("bos-has-tabs");

        var start = tabs.findIndex(function (tab) {
            return tab.classList.contains("has-error");
        });
        if (start === -1) {
            try {
                start = Number(window.sessionStorage.getItem(storeKey) || 0);
            } catch (error) {
                start = 0;
            }
        }
        show(start >= 0 && start < panels.length ? start : 0, false);
    }

    /* Submitting: the pressed button shows it is working, and a second press
       (double click, impatient Enter) does not post the form twice. The
       button is not disabled, so its name/value still goes with the form. */
    function wireSubmitFeedback() {
        document.addEventListener("submit", function (event) {
            var form = event.target;
            if (event.defaultPrevented || (form.getAttribute("method") || "get").toLowerCase() !== "post") {
                return;
            }
            if (form.dataset.bosSending) {
                event.preventDefault();
                return;
            }
            form.dataset.bosSending = "1";
            var button = event.submitter;
            if (button) {
                button.classList.add("is-busy");
                button.setAttribute("aria-busy", "true");
            }
        });
        // Back/forward cache restores the page as it was when it left.
        window.addEventListener("pageshow", function () {
            document.querySelectorAll("form[data-bos-sending]").forEach(function (form) {
                delete form.dataset.bosSending;
                form.querySelectorAll(".is-busy").forEach(function (button) {
                    button.classList.remove("is-busy");
                    button.removeAttribute("aria-busy");
                });
            });
        });
    }

    /* Confirmations leave on their own; warnings and errors stay until read. */
    function wireToasts() {
        document.querySelectorAll("ul.messagelist li.success, ul.messagelist li.info").forEach(function (item, index) {
            var timer = null;
            function leave() {
                item.classList.add("is-leaving");
                window.setTimeout(function () {
                    item.remove();
                }, 320);
            }
            function start() {
                timer = window.setTimeout(leave, 6000 + index * 500);
            }
            item.addEventListener("mouseenter", function () {
                window.clearTimeout(timer);
            });
            item.addEventListener("mouseleave", start);
            start();
        });
    }

    /* Names beside the icons when the menu is collapsed to a rail. Drawn on
       the body because the rail clips anything that sticks out of it. */
    function wireNavTips() {
        var tip = null;
        function hide() {
            if (tip) {
                tip.remove();
                tip = null;
            }
        }
        function show(event) {
            if (!root.classList.contains("bos-nav-collapsed") || MOBILE.matches) {
                return;
            }
            hide();
            var link = event.currentTarget;
            tip = document.createElement("div");
            tip.className = "bos-tip";
            tip.setAttribute("role", "tooltip");
            tip.textContent = link.getAttribute("data-bos-tip");
            var badge = link.querySelector(".bos-nav-badge");
            if (badge) {
                tip.textContent += " · " + badge.textContent.trim() + " waiting";
            }
            document.body.appendChild(tip);
            var rect = link.getBoundingClientRect();
            var rail = document.getElementById("bos-sidebar");
            tip.style.left = (rail ? rail.getBoundingClientRect().right : rect.right) + 8 + "px";
            tip.style.top = rect.top + rect.height / 2 - tip.offsetHeight / 2 + "px";
        }
        document.querySelectorAll("[data-bos-tip]").forEach(function (link) {
            link.addEventListener("mouseenter", show);
            link.addEventListener("focus", show);
            link.addEventListener("mouseleave", hide);
            link.addEventListener("blur", hide);
        });
        window.addEventListener("scroll", hide, true);
        document.addEventListener("click", hide);
    }

    function wireMessages() {
        document.addEventListener("click", function (event) {
            var button = event.target.closest ? event.target.closest("[data-bos-dismiss]") : null;
            if (button) {
                var message = button.closest("li");
                if (message) {
                    message.remove();
                }
            }
        });
    }

    /* A native date box is drawn in the browser's locale, which is not always
       the reader's: an en-US install shows 10/06 for the 6th of October. The
       date in words underneath cannot be read two ways. */
    var ECHO_CLASS = "bos-date-echo";
    var SOURCE_SELECTOR = ".bos-date-echo-source";
    var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
        "August", "September", "October", "November", "December"];
    var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    function spellOut(value) {
        var match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value || "");
        if (!match) {
            return "";
        }
        var day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        var text = WEEKDAYS[day.getDay()] + ", " + Number(match[3]) + " " + MONTHS[Number(match[2]) - 1] + " " + match[1];
        if (match[4]) {
            var hour = Number(match[4]);
            text += " at " + (hour % 12 || 12) + ":" + match[5] + (hour < 12 ? " am" : " pm");
        }
        return text;
    }

    function echoFor(input) {
        var next = input.nextElementSibling;
        if (next && next.classList.contains(ECHO_CLASS)) {
            return next;
        }
        var echo = document.createElement("p");
        echo.className = ECHO_CLASS;
        // Polite: the reader is typing in the box right above it.
        echo.setAttribute("aria-live", "polite");
        input.insertAdjacentElement("afterend", echo);
        return echo;
    }

    function wireDateEchoes(scope) {
        (scope || document).querySelectorAll(SOURCE_SELECTOR).forEach(function (input) {
            if (input.dataset.bosDateEchoWired) {
                return;
            }
            input.dataset.bosDateEchoWired = "1";
            var refresh = function () {
                echoFor(input).textContent = spellOut(input.value);
            };
            input.addEventListener("input", refresh);
            input.addEventListener("change", refresh);
            refresh();
        });
    }

    /* Full-size view of an image, opened from its thumbnail. The anchor keeps
       its href, so a middle click still opens a tab and the page works
       unchanged without this script. */
    var lightbox = null;

    function closeLightbox() {
        if (!lightbox) {
            return;
        }
        lightbox.remove();
        lightbox = null;
        document.removeEventListener("keydown", onLightboxKey);
    }

    function onLightboxKey(event) {
        if (event.key === "Escape") {
            closeLightbox();
        }
    }

    function openLightbox(source, caption) {
        closeLightbox();
        lightbox = document.createElement("div");
        lightbox.className = "bos-lightbox";
        lightbox.setAttribute("role", "dialog");
        lightbox.setAttribute("aria-modal", "true");
        lightbox.setAttribute("aria-label", caption || "View file");

        var image = document.createElement("img");
        image.src = source;
        image.alt = caption || "";

        var close = document.createElement("button");
        close.type = "button";
        close.className = "bos-lightbox-close";
        close.setAttribute("aria-label", "Close");
        close.textContent = "×";

        var label = document.createElement("p");
        label.className = "bos-lightbox-caption";
        label.textContent = caption || "";

        lightbox.appendChild(close);
        lightbox.appendChild(image);
        lightbox.appendChild(label);
        // The backdrop closes; the picture does not, it is where people drag to pan.
        lightbox.addEventListener("click", function (event) {
            if (event.target === lightbox || event.target === close) {
                closeLightbox();
            }
        });
        document.body.appendChild(lightbox);
        document.addEventListener("keydown", onLightboxKey);
        close.focus();
    }

    function wireLightbox() {
        document.addEventListener("click", function (event) {
            var trigger = event.target.closest ? event.target.closest("[data-bos-lightbox]") : null;
            if (!trigger || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
                return;
            }
            event.preventDefault();
            openLightbox(trigger.getAttribute("href"), trigger.getAttribute("data-bos-caption"));
        });
    }

    /* Photo picker: the field shows the chosen picture; "Choose photo" opens a
       searchable grid of Media library thumbnails. Picking one fills the hidden
       input and refreshes the form's "Current photo" straight away. */
    function wireMediaPicker() {
        var modal = null;
        var current = null;
        var timer = null;

        function closePicker() {
            if (!modal) {
                return;
            }
            modal.remove();
            modal = null;
            document.removeEventListener("keydown", onPickerKey);
            var back = current && current.querySelector("[data-bos-picker-open]");
            current = null;
            if (back) {
                back.focus();
            }
        }

        function onPickerKey(event) {
            if (event.key === "Escape") {
                closePicker();
            }
        }

        function setPhoto(picker, item) {
            var input = picker.querySelector("[data-bos-picker-input]");
            var thumb = picker.querySelector("[data-bos-picker-thumb]");
            input.value = item ? item.id : "";
            thumb.hidden = !item;
            if (item) {
                thumb.src = item.thumb;
            }
            picker.querySelector(".bos-picker-tile").classList.toggle("is-empty", !item);
            picker.querySelector(".bos-picker-placeholder").hidden = !!item;
            picker.querySelector("[data-bos-picker-name]").textContent = item ? item.name : "No photo chosen";
            picker.querySelector("[data-bos-picker-label]").textContent = item ? "Change photo" : "Choose photo";
            picker.querySelector("[data-bos-picker-clear]").hidden = !item;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            var section = picker.closest("fieldset, .module");
            var frame = section && section.querySelector(".bos-preview-frame");
            if (frame && item) {
                frame.href = item.full;
                frame.setAttribute("data-bos-caption", item.name);
                frame.querySelector("img").src = item.full;
                var link = section.querySelector(".bos-preview-link");
                if (link) {
                    link.href = item.full;
                }
            }
        }

        function fill(grid, results) {
            grid.textContent = "";
            if (!results.length) {
                var none = document.createElement("p");
                none.className = "bos-picker-none";
                none.textContent = "No photos match. Try another word, or upload a new photo on the form.";
                grid.appendChild(none);
                return;
            }
            var chosen = current.querySelector("[data-bos-picker-input]").value;
            results.forEach(function (item) {
                var option = document.createElement("button");
                option.type = "button";
                option.className = "bos-picker-option";
                option.setAttribute("aria-pressed", item.id === chosen ? "true" : "false");
                option.title = item.name + (item.size ? " · " + item.size : "");
                var image = document.createElement("img");
                image.src = item.thumb;
                image.alt = "";
                image.loading = "lazy";
                var caption = document.createElement("span");
                caption.textContent = item.label || item.name;
                option.appendChild(image);
                option.appendChild(caption);
                option.addEventListener("click", function () {
                    setPhoto(current, item);
                    closePicker();
                });
                grid.appendChild(option);
            });
        }

        function load(grid, query) {
            var source = current.getAttribute("data-source");
            grid.setAttribute("aria-busy", "true");
            fetch(source + "?q=" + encodeURIComponent(query), {
                credentials: "same-origin",
                headers: { "X-Requested-With": "fetch" }
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error(response.status);
                }
                return response.json();
            }).then(function (data) {
                if (modal) {
                    fill(grid, data.results);
                }
            }).catch(function () {
                grid.textContent = "Could not load the Media library. Check the connection and try again.";
            }).then(function () {
                grid.removeAttribute("aria-busy");
            });
        }

        function openPicker(picker) {
            closePicker();
            current = picker;
            modal = document.createElement("div");
            modal.className = "bos-picker-modal";
            modal.innerHTML =
                '<div class="bos-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="bos-picker-title">' +
                '<header class="bos-picker-head"><div><h2 id="bos-picker-title">Choose a photo</h2>' +
                '<p>From the Media library. New photo? Use “Upload a new photo” on the form.</p></div>' +
                '<button type="button" class="bos-picker-close" aria-label="Close">×</button></header>' +
                '<input type="search" class="bos-search bos-picker-search" placeholder="Search photos…" aria-label="Search photos" autocomplete="off">' +
                '<div class="bos-picker-grid" aria-live="polite"></div></div>';
            var grid = modal.querySelector(".bos-picker-grid");
            var search = modal.querySelector(".bos-picker-search");
            modal.addEventListener("click", function (event) {
                if (event.target === modal || event.target.closest(".bos-picker-close")) {
                    closePicker();
                }
            });
            search.addEventListener("input", function () {
                clearTimeout(timer);
                timer = setTimeout(function () {
                    load(grid, search.value.trim());
                }, 250);
            });
            document.body.appendChild(modal);
            document.addEventListener("keydown", onPickerKey);
            load(grid, "");
            search.focus();
        }

        document.addEventListener("click", function (event) {
            var trigger = event.target.closest ? event.target.closest("[data-bos-picker-open], [data-bos-picker-clear]") : null;
            var picker = trigger && trigger.closest("[data-bos-picker]");
            if (!picker) {
                return;
            }
            event.preventDefault();
            if (trigger.hasAttribute("data-bos-picker-clear")) {
                setPhoto(picker, null);
            } else {
                openPicker(picker);
            }
        });
    }

    /* Login: show the password on demand, and warn about Caps Lock before the
       third failed attempt rather than after it. */
    function wireLogin() {
        var password = document.querySelector("[data-bos-password]");
        var reveal = document.querySelector("[data-bos-reveal]");
        var caps = document.querySelector("[data-bos-caps]");
        if (!password) {
            return;
        }
        if (reveal) {
            reveal.addEventListener("click", function () {
                var shown = password.type === "text";
                password.type = shown ? "password" : "text";
                reveal.setAttribute("aria-pressed", shown ? "false" : "true");
                reveal.setAttribute("aria-label", shown ? "Show password" : "Hide password");
                password.focus();
            });
        }
        if (caps) {
            ["keydown", "keyup"].forEach(function (type) {
                password.addEventListener(type, function (event) {
                    caps.hidden = !(event.getModifierState && event.getModifierState("CapsLock"));
                });
            });
        }
    }

    ready(function () {
        wireTheme();
        wireMenu();
        wireUserMenu();
        wirePalette();
        wireMessages();
        wireDateEchoes(document);
        wireLightbox();
        wireMediaPicker();
        wireLogin();
        wireFilters();
        wireAutosubmit();
        wireAvailability();
        wireSubmitFeedback();
        wireToasts();
        wireNavTips();

        // A thumbnail whose file cannot be fetched becomes the empty tile,
        // whether it failed before this script ran or fails later.
        function emptyThumb(image) {
            var empty = document.createElement("span");
            empty.className = "bos-thumb bos-thumb-empty";
            empty.title = "Image not available";
            empty.textContent = "—";
            image.replaceWith(empty);
        }
        document.addEventListener("error", function (event) {
            if (event.target.tagName === "IMG" && event.target.classList.contains("bos-thumb")) {
                emptyThumb(event.target);
            }
        }, true);
        document.querySelectorAll("img.bos-thumb").forEach(function (image) {
            if (image.complete && !image.naturalWidth) {
                emptyThumb(image);
            }
        });
        wireSelects(document);
        wireSelectDismiss();
        wireTabs();

        // A new inline row is cloned from a hidden template after load.
        document.addEventListener("formset:added", function (event) {
            wireDateEchoes(event.target);
            wireSelects(event.target);
        });
    });
})();

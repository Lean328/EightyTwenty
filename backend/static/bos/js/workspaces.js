/* Information architecture only. Entries always come from permission-filtered
   server links; this file grants no access and never changes a destination. */
(function (scope) {
    "use strict";
    var groups = [
        { id: "overview", name: "Overview", keys: ["index"] },
        { id: "operations", name: "Operations", keys: ["orders.order", "bookings.booking", "view:bos_schedule", "view:bos_availability", "enquiries.enquiry", "pos.tilltable"] },
        { id: "customers", name: "Customers", keys: ["accounts.customer", "loyalty.loyaltycard", "loyalty.giftcard", "accounts.customerprofile"] },
        { id: "finance", name: "Finance", keys: ["pos.cashshift", "pos.tilltransaction", "pos.promotion"] },
        { id: "content", name: "Content Studio", keys: ["menu.menuitem", "cms.page", "locations.location", "media.mediaasset", "menu.category", "menu.modifiergroup", "menu.modifieroption", "menu.dietarytag", "menu.locationmenuitem", "enquiries.cateringpackage", "locations.locationimage", "cms.contentblock", "cms.navigationitem", "cms.offer", "cms.faq"] },
        { id: "insights", name: "Insights", keys: ["view:bos_reports"] },
        { id: "settings", name: "Settings", utility: true, keys: ["core.sitesettings", "bookings.bookingrule", "locations.openinghours", "locations.specialhours"] },
        { id: "administration", name: "Administration", utility: true, keys: ["accounts.user", "view:bos_team", "accounts.staffassignment", "view:bos_system", "notifications.emailmessage", "notifications.pushdevice", "core.auditlog"] }
    ];
    function groupFor(key) {
        return groups.find(function (group) { return group.keys.indexOf(key) !== -1; }) || groups[7];
    }
    function resolve(entries, pathname) {
        return entries.filter(function (entry) {
            return entry.href === "/" ? pathname === "/" : pathname.indexOf(entry.href) === 0;
        }).sort(function (a, b) { return b.href.length - a.href.length; })[0];
    }
    function available(entries) {
        return groups.map(function (group) {
            return Object.assign({}, group, { entries: entries.filter(function (entry) {
                return groupFor(entry.key).id === group.id;
            }).sort(function (a, b) { return group.keys.indexOf(a.key) - group.keys.indexOf(b.key); }) });
        }).filter(function (group) { return group.entries.length; });
    }
    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (text) { node.textContent = text; }
        return node;
    }
    function init() {
        var source = document.querySelector(".bos-nav-source");
        if (!source) { return; }
        var entries = Array.from(source.querySelectorAll("[data-bos-nav-link]")).map(function (link) {
            var entry = { key: link.dataset.bosKey, href: link.getAttribute("href"), name: link.querySelector(".bos-nav-text").textContent.trim(), link: link };
            link.dataset.bosSection = groupFor(entry.key).name;
            return entry;
        });
        if (!entries.length) { return; }
        var active = resolve(entries, location.pathname);
        var current = active ? groupFor(active.key) : null;
        var permitted = available(entries);
        var nav = element("div", "bos-primary-nav");
        var utility = element("div", "bos-utility-nav");
        utility.appendChild(element("p", "bos-nav-title", "Workspace"));
        permitted.forEach(function (group) {
            var first = group.entries[0];
            var link = element("a", "bos-nav-link" + (current && current.id === group.id ? " is-active" : ""));
            link.href = first.href;
            link.setAttribute("aria-label", group.name);
            link.dataset.bosTip = group.name;
            link.dataset.bosWorkspace = group.id;
            if (current && current.id === group.id) { link.setAttribute("aria-current", "true"); }
            var glyph = first.link.querySelector("svg");
            if (glyph) { link.appendChild(glyph.cloneNode(true)); }
            link.appendChild(element("span", "bos-nav-text", group.name));
            if (group.id === "operations") {
                var waiting = group.entries.reduce(function (sum, entry) {
                    return sum + Number(entry.link.querySelector(".bos-nav-badge")?.textContent || 0);
                }, 0);
                if (waiting) {
                    var badge = element("span", "bos-nav-badge", String(waiting));
                    badge.setAttribute("aria-label", waiting + " waiting");
                    link.appendChild(badge);
                }
            }
            (group.utility ? utility : nav).appendChild(link);
        });
        source.before(nav);
        source.after(utility);

        if (current && permitted.find(function (item) { return item.id === current.id; }).entries.length > 1) {
            var group = permitted.find(function (item) { return item.id === current.id; });
            var context = element("nav", "bos-context");
            context.setAttribute("aria-label", current.name + " pages");
            context.appendChild(element("span", "bos-context-name", current.name));
            var links = element("div", "bos-context-links");
            var featured = group.entries.slice(0, current.id === "content" ? 4 : 5);
            if (active && featured.indexOf(active) === -1) { featured.push(active); }
            featured.forEach(function (entry) {
                var link = element("a", entry === active ? "is-current" : "", entry.name);
                link.href = entry.href;
                if (entry === active) { link.setAttribute("aria-current", "page"); }
                links.appendChild(link);
            });
            context.appendChild(links);
            if (group.entries.length > featured.length) {
                var browse = element("button", "bos-context-browse", "Browse " + current.name);
                browse.type = "button";
                browse.setAttribute("aria-haspopup", "dialog");
                browse.addEventListener("click", function () { openDirectory(group); });
                context.appendChild(browse);
            }
            document.querySelector(".bos-content").before(context);
        }
        var crumbs = document.querySelector(".bos-crumbs");
        if (crumbs && current) {
            var trail = element("div", "bos-workspace-trail");
            var home = element("a", "", current.name);
            home.href = permitted.find(function (item) { return item.id === current.id; }).entries[0].href;
            trail.appendChild(home);
            if (active && current.name !== active.name) {
                trail.appendChild(element("span", "", "/"));
                trail.appendChild(element("span", "", active.name));
            }
            crumbs.appendChild(trail);
        }

        var dialog = element("dialog", "bos-directory");
        dialog.setAttribute("aria-labelledby", "bos-directory-title");
        var head = element("div", "bos-directory-head");
        var heading = element("h2", "", "Workspace pages");
        heading.id = "bos-directory-title";
        var close = element("button", "bos-btn bos-btn-ghost", "Close");
        close.type = "button";
        close.addEventListener("click", function () { dialog.close(); });
        head.append(heading, close);
        var search = element("input", "bos-directory-search");
        search.type = "search";
        search.placeholder = "Find a page…";
        search.setAttribute("aria-label", "Find a workspace page");
        var results = element("div", "bos-directory-results");
        var empty = element("p", "bos-directory-empty", "No pages match. Try another name.");
        empty.hidden = true;
        dialog.append(head, search, results, empty);
        document.body.appendChild(dialog);
        var directoryTrigger = null;
        dialog.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                // Search inputs may consume Escape to clear their value. The
                // workspace directory has one consistent dismissal action.
                event.preventDefault();
                event.stopPropagation();
                dialog.close();
            }
        });
        dialog.addEventListener("close", function () {
            if (directoryTrigger && directoryTrigger.isConnected) { directoryTrigger.focus(); }
        });
        search.addEventListener("input", function () {
            var query = search.value.toLowerCase().trim();
            var count = 0;
            results.querySelectorAll("a").forEach(function (link) {
                link.hidden = !link.textContent.toLowerCase().includes(query);
                if (!link.hidden) { count++; }
            });
            empty.hidden = count > 0;
        });
        dialog.addEventListener("click", function (event) {
            if (event.target === dialog && (event.offsetX < 0 || event.offsetY < 0 || event.offsetX > dialog.clientWidth || event.offsetY > dialog.clientHeight)) { dialog.close(); }
        });
        document.addEventListener("keydown", function (event) {
            if (dialog.open && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { dialog.close(); }
        }, true);
        function openDirectory(group) {
            directoryTrigger = document.activeElement;
            document.querySelector("[data-bos-close-drawer]")?.click();
            results.replaceChildren();
            heading.textContent = group.name;
            search.value = "";
            empty.hidden = true;
            group.entries.forEach(function (entry) {
                var link = element("a", "bos-directory-link");
                link.href = entry.href;
                var glyph = entry.link.querySelector("svg");
                if (glyph) { link.appendChild(glyph.cloneNode(true)); }
                link.appendChild(element("span", "", entry.name));
                if (entry === active) { link.setAttribute("aria-current", "page"); }
                results.appendChild(link);
            });
            dialog.showModal();
            search.focus();
        }
        document.documentElement.classList.add("bos-navigation-ready");
    }
    function enhanceLists() {
        var tools = document.querySelector(".change-list #content-main > .object-tools");
        var slot = document.querySelector("[data-bos-list-tools]");
        if (tools && slot) { slot.appendChild(tools); }
        var filters = document.querySelector("#changelist-filter");
        var toolbar = document.querySelector("#toolbar");
        if (!filters || !toolbar) { return; }
        var count = filters.querySelectorAll(".bos-select-filter.is-set").length;
        var button = element("button", "bos-btn bos-btn-ghost bos-filter-toggle", "Filters" + (count ? " · " + count + " active" : ""));
        button.type = "button";
        button.setAttribute("aria-controls", "changelist-filter");
        function expanded(value) {
            filters.hidden = !value;
            button.setAttribute("aria-expanded", String(value));
        }
        expanded(count > 0 || window.innerWidth >= 768);
        button.addEventListener("click", function () { expanded(filters.hidden); });
        toolbar.appendChild(button);
    }
    scope.BOSWorkspaces = { groups: groups, groupFor: groupFor, resolve: resolve, available: available, init: init, enhanceLists: enhanceLists };
})(typeof window === "undefined" ? globalThis : window);

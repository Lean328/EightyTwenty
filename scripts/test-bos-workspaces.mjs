import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('../backend/static/bos/js/workspaces.js', import.meta.url), 'utf8');
const context = {};
runInNewContext(source, context);
const api = context.BOSWorkspaces;
const navigation = readFileSync(new URL('../backend/apps/core/admin_site.py', import.meta.url), 'utf8').split('NAVIGATION = (')[1].split('# Roles')[0];
const serverKeys = [...navigation.matchAll(/\("([\w.:]+)", "[^"]+", "[^"]+"\)/g)].map(match => match[1]);

test('all server destinations have one workspace, with six primary areas', () => {
    const mapped = api.groups.flatMap(group => Array.from(group.keys));
    assert.equal(serverKeys.length, 40);
    assert.deepEqual([...mapped].sort(), [...serverKeys].sort());
    assert.equal(new Set(mapped).size, mapped.length);
    assert.equal(api.groups.filter(group => !group.utility).length, 6);
});

test('role-filtered navigation never fabricates entries or empty workspaces', () => {
    const staff = [{ key: 'index', href: '/' }, { key: 'bookings.booking', href: '/bookings/booking/' }];
    const grouped = api.available(staff);
    assert.equal(grouped.length, 2);
    assert.equal(grouped.flatMap(group => group.entries).length, staff.length);
    assert.equal(grouped.some(group => group.id === 'finance'), false);
});

test('deep links, add, history and confirmation retain their workspace', () => {
    const entries = [{ key: 'index', href: '/' }, { key: 'menu.menuitem', href: '/menu/menuitem/' }];
    for (const tail of ['', 'add/', 'uuid/change/', 'uuid/history/', 'uuid/delete/']) {
        assert.equal(api.resolve(entries, '/menu/menuitem/' + tail).key, 'menu.menuitem');
    }
    assert.equal(api.resolve(entries, '/profile/'), undefined);
    assert.equal(api.resolve(entries, '/').key, 'index');
});

test('future server destinations stay reachable through Administration', () => {
    const future = { key: 'future.record', href: '/future/record/' };
    assert.equal(api.groupFor(future.key).id, 'administration');
    assert.equal(api.available([future])[0].entries[0], future);
});

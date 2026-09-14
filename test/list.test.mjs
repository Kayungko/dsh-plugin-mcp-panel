import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumerateMcpServers } from '../list.mjs';

test('enumerates servers from mcp__<server>__<tool> names', () => {
  const snap = enumerateMcpServers([
    'mcp__openviking__remember',
    'mcp__openviking__search',
    'mcp__openviking__read',
    'mcp__codegraph__explore',
    'mcp__codegraph__node',
  ]);
  assert.equal(snap.total, 2);
  assert.deepEqual(snap.servers, [
    { name: 'codegraph', tools: 2, active: true },
    { name: 'openviking', tools: 3, active: true },
  ]);
});

test('deduplicates repeated tool names per server', () => {
  const snap = enumerateMcpServers(['mcp__a__x', 'mcp__a__x', 'mcp__a__y']);
  assert.equal(snap.total, 1);
  assert.deepEqual(snap.servers, [{ name: 'a', tools: 2, active: true }]);
});

test('ignores non-mcp names', () => {
  const snap = enumerateMcpServers(['task_list', 'read', 'mcp__a__x']);
  assert.equal(snap.total, 1);
  assert.equal(snap.servers[0].name, 'a');
});

test('rejects malformed mcp names', () => {
  const snap = enumerateMcpServers(['mcp__a', 'mcp____x', 'mcp__', 'mcp__a__']);
  assert.equal(snap.total, 0);
});

test('empty and non-array input yield empty snapshot', () => {
  assert.deepEqual(enumerateMcpServers([]), { servers: [], total: 0 });
  assert.deepEqual(enumerateMcpServers(undefined), { servers: [], total: 0 });
  assert.deepEqual(enumerateMcpServers([null, 42, '', 'mcp__a__x']), { servers: [{ name: 'a', tools: 1, active: true }], total: 1 });
});

test('sorts servers by name', () => {
  const snap = enumerateMcpServers(['mcp__b__x', 'mcp__a__x']);
  assert.deepEqual(snap.servers.map((s) => s.name), ['a', 'b']);
});

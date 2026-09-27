import assert from 'node:assert/strict';
import test from 'node:test';
import { claudeCodeAdapter } from '@/lib/cli/providers/claude-code/adapter';
import { codexAdapter } from '@/lib/cli/providers/codex/adapter';
import { opencodeAdapter } from '@/lib/cli/providers/opencode/adapter';

test('providers preserve native scrollback clears so resize redraws can replace history', () => {
  assert.equal(claudeCodeAdapter.getTerminalResizeScrollbackPolicy(), 'native');
  assert.equal(codexAdapter.getTerminalResizeScrollbackPolicy(), 'native');
  assert.equal(opencodeAdapter.getTerminalResizeScrollbackPolicy(), 'native');
});

test('providers declare whether one Escape can interrupt their terminal UI', () => {
  assert.equal(claudeCodeAdapter.getTerminalInterruptInputPolicy(), 'single-escape');
  assert.equal(codexAdapter.getTerminalInterruptInputPolicy(), 'single-escape');
  assert.equal(opencodeAdapter.getTerminalInterruptInputPolicy(), 'none');
});

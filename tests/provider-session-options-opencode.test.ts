import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadOpenCodeSessionOptions,
  parseOpenCodeApiModels,
  type OpenCodeCommandRunner,
} from '@/lib/cli/provider-session-options-opencode';
import { mergeCustomModelIds } from '@/lib/cli/provider-session-custom-models';
import type { ExecResult } from '@/lib/cli/cli-exec';

interface RunnerCall {
  command: string;
  args: string[];
  environment: 'native' | 'wsl';
  timeoutMs: number;
}

function result(overrides: Partial<ExecResult> = {}): ExecResult {
  return {
    ok: true,
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 1,
    ...overrides,
  };
}

function stubRunner(results: ExecResult[]): {
  runner: OpenCodeCommandRunner;
  calls: RunnerCall[];
} {
  const calls: RunnerCall[] = [];
  const queue = [...results];
  return {
    calls,
    runner: async (command, args, environment, timeoutMs) => {
      calls.push({ command, args, environment, timeoutMs });
      const next = queue.shift();
      assert.ok(next, `unexpected command call: ${command} ${args.join(' ')}`);
      return next;
    },
  };
}

const LEGACY_MODEL = [
  'opencode-go/glm-5.3-flash',
  '{',
  '  "id": "glm-5.3-flash",',
  '  "providerID": "opencode-go",',
  '  "name": "GLM-5.3-Flash",',
  '  "variants": {}',
  '}',
].join('\n');

test('a valid legacy catalog stays primary and skips the API probe', async () => {
  const stub = stubRunner([result({ stdout: LEGACY_MODEL })]);

  const options = await loadOpenCodeSessionOptions('native', stub.runner);

  assert.deepEqual(options.modelOptions.map((model) => model.value), [
    'opencode-go/glm-5.3-flash',
  ]);
  assert.deepEqual(stub.calls, [{
    command: 'opencode',
    args: ['models', '--verbose'],
    environment: 'native',
    timeoutMs: 10_000,
  }]);
});

for (const scenario of [
  {
    name: 'legacy command failure',
    legacy: result({ ok: false, exitCode: 1, stderr: 'Unrecognized flag: --verbose' }),
  },
  {
    name: 'legacy command timeout',
    legacy: result({ ok: false, exitCode: null, timedOut: true }),
  },
  {
    name: 'empty legacy catalog',
    legacy: result({ stdout: '' }),
  },
]) {
  test(`${scenario.name} invokes the API with the same environment and timeout`, async () => {
    const stub = stubRunner([
      scenario.legacy,
      result({ stdout: '{"location":{"directory":"<PROJECT>"},"data":[]}' }),
    ]);

    await loadOpenCodeSessionOptions('wsl', stub.runner);

    assert.deepEqual(stub.calls, [
      {
        command: 'opencode',
        args: ['models', '--verbose'],
        environment: 'wsl',
        timeoutMs: 10_000,
      },
      {
        command: 'opencode',
        args: ['api', 'model.list'],
        environment: 'wsl',
        timeoutMs: 10_000,
      },
    ]);
  });
}

test('API models preserve valid identity, label, order, and first-default semantics', () => {
  const models = parseOpenCodeApiModels(JSON.stringify({
    location: { directory: '<PROJECT>' },
    data: [
      {
        providerID: 'opencode-go',
        id: 'glm-5.3-flash',
        name: 'GLM-5.3-Flash',
        enabled: true,
      },
      {
        providerID: 'opencode',
        id: 'space-bunny-free',
        name: 'Space Bunny Free',
      },
    ],
  }));

  assert.deepEqual(models, [
    {
      value: 'opencode-go/glm-5.3-flash',
      label: 'opencode-go/GLM-5.3-Flash',
      isDefault: true,
      defaultReasoningEffort: null,
      supportedReasoningEfforts: [],
    },
    {
      value: 'opencode/space-bunny-free',
      label: 'opencode/Space Bunny Free',
      isDefault: false,
      defaultReasoningEffort: null,
      supportedReasoningEfforts: [],
    },
  ]);
});

test('API model identity falls back to modelID when id is blank', () => {
  const models = parseOpenCodeApiModels(JSON.stringify({
    data: [{
      providerID: 'opencode',
      id: '   ',
      modelID: 'space-bunny-free',
    }],
  }));

  assert.deepEqual(models.map((model) => ({ value: model.value, label: model.label })), [{
    value: 'opencode/space-bunny-free',
    label: 'opencode/space-bunny-free',
  }]);
});

test('one valid API entry survives disabled and malformed neighbors', () => {
  const models = parseOpenCodeApiModels(JSON.stringify({
    data: [
      { providerID: 'opencode-go', id: 'glm-5.3-flash', enabled: true },
      { providerID: 'opencode', id: 'disabled-model', enabled: false },
      { id: 'missing-provider' },
      { providerID: 'opencode' },
      null,
    ],
  }));

  assert.deepEqual(models.map((model) => model.value), ['opencode-go/glm-5.3-flash']);
  assert.equal(models[0]?.isDefault, true);
});

test('API array variants become ordered reasoning effort options', () => {
  const [model] = parseOpenCodeApiModels(JSON.stringify({
    data: [{
      providerID: 'opencode-go',
      id: 'glm-5.3-flash',
      variants: [
        { id: 'low', settings: { reasoningEffort: 'low' } },
        { id: 'high', settings: { reasoningEffort: 'high' } },
        { id: 'max', settings: { reasoningEffort: 'max' } },
      ],
    }],
  }));

  assert.equal(model?.defaultReasoningEffort, 'default');
  assert.deepEqual(model?.supportedReasoningEfforts, [
    {
      value: 'default',
      label: 'Default',
      description: 'Use the OpenCode model default',
    },
    { value: 'low', label: 'Low', description: 'Use OpenCode low reasoning' },
    { value: 'high', label: 'High', description: 'Use OpenCode high reasoning' },
    { value: 'max', label: 'Max', description: 'Use OpenCode max reasoning' },
  ]);
});

test('API variants ignore reserved, duplicate, and blank IDs while preserving descriptions', () => {
  const [model] = parseOpenCodeApiModels(JSON.stringify({
    data: [{
      providerID: 'opencode',
      id: 'reasoning-model',
      variants: [
        { id: 'default', settings: { reasoningEffort: 'ignored' } },
        { id: 'high', settings: { thinking: { budgetTokens: 8192 } } },
        { id: 'high', settings: { reasoningEffort: 'duplicate' } },
        { id: '  ', settings: { reasoningEffort: 'blank' } },
        { id: 'max', settings: {} },
      ],
    }],
  }));

  assert.deepEqual(model?.supportedReasoningEfforts, [
    {
      value: 'default',
      label: 'Default',
      description: 'Use the OpenCode model default',
    },
    {
      value: 'high',
      label: 'High',
      description: 'Use OpenCode high thinking (8,192 tokens)',
    },
    { value: 'max', label: 'Max', description: 'Use OpenCode max thinking' },
  ]);
});

for (const variants of [undefined, {}, []]) {
  test(`API model without an array variant catalog stays capability-free: ${JSON.stringify(variants)}`, () => {
    const [model] = parseOpenCodeApiModels(JSON.stringify({
      data: [{ providerID: 'opencode', id: 'plain-model', variants }],
    }));

    assert.equal(model?.defaultReasoningEffort, null);
    assert.deepEqual(model?.supportedReasoningEfforts, []);
  });
}

test('both catalog commands can fail without rejecting session options', async () => {
  const stub = stubRunner([
    result({ ok: false, exitCode: 1, stderr: 'legacy failure' }),
    result({ ok: false, exitCode: null, timedOut: true, stderr: 'api timeout' }),
  ]);

  const options = await loadOpenCodeSessionOptions('native', stub.runner);

  assert.deepEqual(options.modelOptions, []);
  assert.equal(options.providerId, 'opencode');
  assert.equal(stub.calls.length, 2);
});

for (const apiOutput of [
  '{not-json',
  '{"location":{"directory":"<PROJECT>"}}',
  '{"data":[null,{"providerID":"opencode"},{"id":"missing-provider"}]}',
]) {
  test(`malformed or empty API catalog degrades to empty options: ${apiOutput}`, async () => {
    const stub = stubRunner([
      result({ ok: false, exitCode: 1 }),
      result({ stdout: apiOutput }),
    ]);

    const options = await loadOpenCodeSessionOptions('native', stub.runner);

    assert.deepEqual(options.modelOptions, []);
  });
}

test('custom model IDs remain available after discovered catalog failure', async () => {
  const stub = stubRunner([
    result({ ok: false, exitCode: 1 }),
    result({ stdout: '{not-json' }),
  ]);
  const discovered = await loadOpenCodeSessionOptions('native', stub.runner);

  const merged = mergeCustomModelIds(discovered, [' opencode-go/glm-5.3-flash ']);

  assert.deepEqual(merged.modelOptions, [{
    value: 'opencode-go/glm-5.3-flash',
    label: 'opencode-go/glm-5.3-flash',
    isDefault: false,
    defaultReasoningEffort: null,
    supportedReasoningEfforts: [],
  }]);
});

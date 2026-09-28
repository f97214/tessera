import {
  OPENCODE_ACCESS_OPTIONS,
  OPENCODE_MODE_OPTIONS,
} from './provider-session-option-definitions';
import { execCli, type ExecResult } from './cli-exec';
import type { AgentEnvironment } from '../settings/types';
import type {
  ProviderModelOption,
  ProviderReasoningEffortOption,
  ProviderSessionOptions,
} from './provider-session-option-types';
import { OPENCODE_DEFAULT_REASONING_EFFORT } from './providers/opencode/session-config';

const OPENCODE_MODEL_PROBE_TIMEOUT_MS = 10_000;
// OpenCode 2.x loads providers per directory on the first catalog query and answers that
// query with an empty `data` array; the next query ~0.3-0.6 s later returns the catalog.
const OPENCODE_EMPTY_CATALOG_RETRIES = 2;
const OPENCODE_EMPTY_CATALOG_RETRY_DELAY_MS = 500;

interface OpenCodeVerboseModel {
  id?: string;
  providerID?: string;
  name?: string;
  variants?: Record<string, unknown>;
}

interface OpenCodeApiModelEntry {
  providerID?: unknown;
  id?: unknown;
  modelID?: unknown;
  name?: unknown;
  enabled?: unknown;
  variants?: unknown;
}

export type OpenCodeCommandRunner = (
  command: string,
  args: string[],
  environment: AgentEnvironment,
  timeoutMs: number,
) => Promise<ExecResult>;

export interface OpenCodeProbeTiming {
  now: () => number;
  wait: (ms: number) => Promise<void>;
}

const REAL_TIMING: OpenCodeProbeTiming = {
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function loadOpenCodeSessionOptions(
  agentEnvironment: AgentEnvironment,
  runCommand: OpenCodeCommandRunner = execCli,
  timing: OpenCodeProbeTiming = REAL_TIMING,
): Promise<ProviderSessionOptions> {
  const modelResult = await runCommand(
    'opencode',
    ['models', '--verbose'],
    agentEnvironment,
    OPENCODE_MODEL_PROBE_TIMEOUT_MS,
  );

  let modelOptions = modelResult.ok
    ? parseOpenCodeVerboseModels(modelResult.stdout)
    : [];

  if (modelOptions.length === 0) {
    modelOptions = await probeOpenCodeApiModels(agentEnvironment, runCommand, timing);
  }

  return buildOpenCodeSessionOptions(modelOptions);
}

async function probeOpenCodeApiModels(
  agentEnvironment: AgentEnvironment,
  runCommand: OpenCodeCommandRunner,
  timing: OpenCodeProbeTiming,
): Promise<ProviderModelOption[]> {
  const deadline = timing.now() + OPENCODE_MODEL_PROBE_TIMEOUT_MS;
  let timeoutMs = OPENCODE_MODEL_PROBE_TIMEOUT_MS;
  for (let retry = 0; ; retry += 1) {
    const apiResult = await runCommand('opencode', ['api', 'model.list'], agentEnvironment, timeoutMs);
    if (!apiResult.ok) return [];
    if (retry >= OPENCODE_EMPTY_CATALOG_RETRIES || !isEmptyOpenCodeApiCatalog(apiResult.stdout)) {
      return parseOpenCodeApiModels(apiResult.stdout);
    }
    await timing.wait(OPENCODE_EMPTY_CATALOG_RETRY_DELAY_MS);
    timeoutMs = deadline - timing.now();
    if (timeoutMs <= 0) return [];
  }
}

function isEmptyOpenCodeApiCatalog(stdout: string): boolean {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return isRecord(parsed) && Array.isArray(parsed.data) && parsed.data.length === 0;
  } catch {
    return false;
  }
}

export function parseOpenCodeApiModels(stdout: string): ProviderModelOption[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.data)) {
    return [];
  }

  const modelOptions: ProviderModelOption[] = [];
  for (const rawEntry of parsed.data) {
    if (!isRecord(rawEntry)) continue;
    const entry = rawEntry as OpenCodeApiModelEntry;
    if (entry.enabled === false) continue;

    const providerId = readNonEmptyString(entry.providerID);
    const modelId = readNonEmptyString(entry.id) ?? readNonEmptyString(entry.modelID);
    if (!providerId || !modelId) continue;

    const labelName = readNonEmptyString(entry.name) ?? modelId;
    const reasoningEfforts = buildReasoningEffortOptions(normalizeApiVariants(entry.variants));
    modelOptions.push({
      value: `${providerId}/${modelId}`,
      label: `${providerId}/${labelName}`,
      isDefault: modelOptions.length === 0,
      defaultReasoningEffort: reasoningEfforts.length > 0
        ? OPENCODE_DEFAULT_REASONING_EFFORT
        : null,
      supportedReasoningEfforts: reasoningEfforts,
    });
  }
  return modelOptions;
}

export function buildOpenCodeSessionOptions(
  modelOptions: ProviderModelOption[],
): ProviderSessionOptions {
  return {
    providerId: 'opencode',
    displayName: 'OpenCode',
    supportsReasoningEffort: true,
    runtimeEffortChange: true,
    runtimeAccessChange: false,
    modelOptions,
    permissionMappings: [],
    modeOptions: [...OPENCODE_MODE_OPTIONS],
    accessOptions: [...OPENCODE_ACCESS_OPTIONS],
    planLocksAccess: false,
  };
}

export function parseOpenCodeVerboseModels(stdout: string): ProviderModelOption[] {
  const modelOptions: ProviderModelOption[] = [];
  const lines = stdout.split(/\r?\n/);
  let currentModelId: string | null = null;
  let jsonLines: string[] = [];
  let braceDepth = 0;

  const flush = () => {
    if (!currentModelId || jsonLines.length === 0) {
      currentModelId = null;
      jsonLines = [];
      braceDepth = 0;
      return;
    }

    const raw = jsonLines.join('\n');
    try {
      const model = JSON.parse(raw) as OpenCodeVerboseModel;
      modelOptions.push(buildModelOptionFromVerboseEntry(currentModelId, model, modelOptions.length === 0));
    } catch {
      modelOptions.push(buildFallbackModelOption(currentModelId, modelOptions.length === 0));
    }

    currentModelId = null;
    jsonLines = [];
    braceDepth = 0;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (currentModelId === null) {
      if (line.startsWith('{')) {
        continue;
      }
      currentModelId = line;
      continue;
    }

    jsonLines.push(rawLine);
    braceDepth += countChar(rawLine, '{') - countChar(rawLine, '}');
    if (braceDepth <= 0 && jsonLines.length > 0) {
      flush();
    }
  }

  flush();

  return modelOptions;
}

function buildModelOptionFromVerboseEntry(
  listedModelId: string,
  model: OpenCodeVerboseModel,
  isDefault: boolean,
): ProviderModelOption {
  const providerId = String(model.providerID ?? listedModelId.split('/')[0] ?? '').trim();
  const modelId = String(model.id ?? listedModelId.split('/').slice(1).join('/') ?? '').trim();
  const value = providerId && modelId ? `${providerId}/${modelId}` : listedModelId;
  const labelName = String(model.name ?? (modelId || value)).trim();
  const label = providerId && labelName ? `${providerId}/${labelName}` : value;
  const reasoningEfforts = buildReasoningEffortOptions(model.variants ?? {});

  return {
    value,
    label,
    isDefault,
    defaultReasoningEffort: reasoningEfforts.length > 0 ? OPENCODE_DEFAULT_REASONING_EFFORT : null,
    supportedReasoningEfforts: reasoningEfforts,
  };
}

function buildFallbackModelOption(value: string, isDefault: boolean): ProviderModelOption {
  return {
    value,
    label: value,
    isDefault,
    defaultReasoningEffort: null,
    supportedReasoningEfforts: [],
  };
}

function buildReasoningEffortOptions(
  variants: Record<string, unknown>,
): ProviderReasoningEffortOption[] {
  const variantNames = Object.keys(variants).filter((variant) => variant && variant !== 'default');
  if (variantNames.length === 0) {
    return [];
  }

  return [
    {
      value: OPENCODE_DEFAULT_REASONING_EFFORT,
      label: 'Default',
      description: 'Use the OpenCode model default',
    },
    ...variantNames.map((variant) => ({
      value: variant,
      label: formatVariantLabel(variant),
      description: buildVariantDescription(variant, variants[variant]),
    })),
  ];
}

function formatVariantLabel(variant: string): string {
  if (variant === 'xhigh') return 'XHigh';
  return variant.charAt(0).toUpperCase() + variant.slice(1);
}

function buildVariantDescription(variant: string, rawConfig: unknown): string {
  if (isRecord(rawConfig)) {
    const reasoningEffort = typeof rawConfig.reasoningEffort === 'string'
      ? rawConfig.reasoningEffort
      : undefined;
    if (reasoningEffort) {
      return `Use OpenCode ${reasoningEffort} reasoning`;
    }

    const thinking = isRecord(rawConfig.thinking) ? rawConfig.thinking : undefined;
    const budgetTokens = typeof thinking?.budgetTokens === 'number'
      ? thinking.budgetTokens
      : undefined;
    if (budgetTokens !== undefined) {
      return `Use OpenCode ${variant} thinking (${budgetTokens.toLocaleString()} tokens)`;
    }
  }

  return `Use OpenCode ${variant} thinking`;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeApiVariants(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value)) return {};

  const variants: Record<string, unknown> = {};
  for (const rawVariant of value) {
    if (!isRecord(rawVariant)) continue;
    const variantId = readNonEmptyString(rawVariant.id);
    if (!variantId || variantId === OPENCODE_DEFAULT_REASONING_EFFORT || variantId in variants) {
      continue;
    }
    variants[variantId] = isRecord(rawVariant.settings) ? rawVariant.settings : {};
  }
  return variants;
}

function countChar(value: string, char: string): number {
  let count = 0;
  for (const next of value) {
    if (next === char) count += 1;
  }
  return count;
}

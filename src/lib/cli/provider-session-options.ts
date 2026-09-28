import type { PermissionMode } from '@/lib/ws/message-types';
import {
  buildCodexPermissionMapping,
  buildSharedPermissionMapping,
} from './provider-session-option-definitions';
import {
  type ProviderModelOption,
  type ProviderAccessOption,
  type ProviderModeOption,
  type ProviderPermissionMapping,
  type ProviderReasoningEffortOption,
  type ProviderSessionOptions,
} from './provider-session-option-types';
import { loadCodexSessionOptions } from './provider-session-options-codex';
import { loadClaudeSessionOptions } from './provider-session-options-claude';
import { loadOpenCodeSessionOptions } from './provider-session-options-opencode';
import { mergeCustomModelIds } from './provider-session-custom-models';
import { getAgentEnvironment } from './spawn-cli';
import type { AgentEnvironment } from '../settings/types';
import { SettingsManager } from '../settings/manager';

const CACHE_TTL_MS = 30_000;

const cache = new Map<string, { expiresAt: number; value: ProviderSessionOptions }>();
const inflight = new Map<string, Promise<ProviderSessionOptions>>();

export type {
  ProviderModelOption,
  ProviderAccessOption,
  ProviderModeOption,
  ProviderPermissionMapping,
  ProviderReasoningEffortOption,
  ProviderSessionOptions,
} from './provider-session-option-types';

/** Probes a provider's options before custom models are merged; injectable for tests. */
export type ProviderSessionOptionsDiscovery = (
  providerId: string,
  agentEnvironment: AgentEnvironment | 'static',
  userId?: string,
) => Promise<ProviderSessionOptions>;

export async function getProviderSessionOptions(
  providerId: string,
  userId?: string,
  agentEnvironmentOverride?: AgentEnvironment,
  discover: ProviderSessionOptionsDiscovery = discoverProviderSessionOptions,
): Promise<ProviderSessionOptions> {
  const agentEnvironment = await getSessionOptionsAgentEnvironment(
    providerId,
    userId,
    agentEnvironmentOverride,
  );
  const cacheKey = buildCacheKey(providerId, userId, agentEnvironment);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const pending = inflight.get(cacheKey);
  if (pending) {
    return pending;
  }

  const loader = loadProviderSessionOptions(providerId, userId, agentEnvironment, discover)
    .then(({ value, cacheable }) => {
      if (cacheable) {
        cache.set(cacheKey, {
          value,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
      }
      inflight.delete(cacheKey);
      return value;
    })
    .catch((error) => {
      inflight.delete(cacheKey);
      throw error;
    });

  inflight.set(cacheKey, loader);
  return loader;
}

export function invalidateProviderSessionOptionsCache(userId?: string): void {
  if (!userId) {
    cache.clear();
    inflight.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.split(':')[1] === userId) {
      cache.delete(key);
    }
  }

  for (const key of inflight.keys()) {
    if (key.split(':')[1] === userId) {
      inflight.delete(key);
    }
  }
}

async function getSessionOptionsAgentEnvironment(
  providerId: string,
  userId?: string,
  agentEnvironmentOverride?: AgentEnvironment,
): Promise<AgentEnvironment | 'static'> {
  if (providerId === 'claude-code' || providerId === 'codex' || providerId === 'opencode') {
    return agentEnvironmentOverride ?? getAgentEnvironment(userId);
  }

  return 'static';
}

function buildCacheKey(
  providerId: string,
  userId: string | undefined,
  agentEnvironment: AgentEnvironment | 'static',
): string {
  return `${providerId}:${userId ?? 'anonymous'}:${agentEnvironment}`;
}

async function discoverProviderSessionOptions(
  providerId: string,
  agentEnvironment: AgentEnvironment | 'static',
  userId?: string,
): Promise<ProviderSessionOptions> {
  if (providerId === 'codex') {
    return loadCodexSessionOptions(
      userId,
      agentEnvironment === 'static' ? undefined : agentEnvironment,
    );
  }
  if (providerId === 'opencode') {
    return loadOpenCodeSessionOptions(agentEnvironment === 'static' ? 'native' : agentEnvironment);
  }
  return loadClaudeSessionOptions(agentEnvironment === 'static' ? 'native' : agentEnvironment);
}

async function loadProviderSessionOptions(
  providerId: string,
  userId: string | undefined,
  agentEnvironment: AgentEnvironment | 'static',
  discover: ProviderSessionOptionsDiscovery,
): Promise<{ value: ProviderSessionOptions; cacheable: boolean }> {
  const sessionOptions = await discover(providerId, agentEnvironment, userId);
  // An empty OpenCode catalog usually means its providers were still loading; probe again
  // on the next request instead of serving the empty list for the whole cache lifetime.
  const cacheable = providerId !== 'opencode' || sessionOptions.modelOptions.length > 0;

  if (!userId) {
    return { value: sessionOptions, cacheable };
  }

  const settings = await SettingsManager.load(userId, { silent: true });
  return {
    value: mergeCustomModelIds(
      sessionOptions,
      settings.providerCustomModels[providerId],
    ),
    cacheable,
  };
}

export function getProviderPermissionMapping(
  providerId: string,
  permissionMode: PermissionMode,
): ProviderPermissionMapping | undefined {
  if (providerId === 'codex') {
    return buildCodexPermissionMapping(permissionMode);
  }

  return buildSharedPermissionMapping(permissionMode);
}

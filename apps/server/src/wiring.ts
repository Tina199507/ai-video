import { join } from 'node:path';
import { Workbench } from './workbench.js';
import type { WorkbenchEvent } from './types.js';
import { ChatAdapter } from '@ai-video/adapter-common/chatAdapter.js';
import { installAdapterHostBindings } from './adapterHostBindings.js';
import { ConfigStore } from './configStore.js';
import { PipelineService } from '@ai-video/pipeline-core/pipelineService.js';
import { getGlobalPluginRegistry } from '@ai-video/pipeline-core/providerRegistry.js';
import { createLogger, type Logger } from '@ai-video/lib/logger.js';

export interface ServerEventBridge {
  emit: (event: WorkbenchEvent) => void;
  setSink: (sink: (event: WorkbenchEvent) => void) => void;
}

export interface ServerWiring {
  workbench: Workbench;
  pipelineService: PipelineService;
  eventBridge: ServerEventBridge;
}

function createEventBridge(): ServerEventBridge {
  let sink: (event: WorkbenchEvent) => void = () => {};
  return {
    emit(event) {
      sink(event);
    },
    setSink(nextSink) {
      sink = nextSink;
    },
  };
}

export function createServerWiring(
  dataDir: string,
  logger: Logger = createLogger('server'),
): ServerWiring {
  const eventBridge = createEventBridge();
  const workbench = new Workbench(join(dataDir, 'resources.json'));

  installAdapterHostBindings();

  const chatAdapter = new ChatAdapter(workbench, { assetsDir: join(dataDir, 'assets') });

  const configStore = new ConfigStore(dataDir);
  const savedConfig = configStore.get();

  // Collect all aivideomaker API keys (single key + array keys, deduplicated)
  const aivideomakerApiKey = savedConfig.aivideomakerApiKey || process.env.AIVIDEOMAKER_API_KEY || '';
  const allAivideomakerKeys = [
    ...(aivideomakerApiKey ? [aivideomakerApiKey] : []),
    ...(savedConfig.aivideomakerApiKeys ?? []),
  ].filter((k, i, arr) => k && arr.indexOf(k) === i);

  if (allAivideomakerKeys.length > 0) {
    logger.info('aivideomaker_initialized', {
      count: allAivideomakerKeys.length,
      fingerprints: allAivideomakerKeys.map(k => `${k.slice(0, 4)}…${k.slice(-4)}`),
    });
  }

  /* ---- Register API keys as AiResource (type='api') ---- */
  workbench.resources.syncApiKeys({
    aivideomakerApiKeys: allAivideomakerKeys,
  });

  workbench.onEvent(eventBridge.emit);

  const pipelineService = new PipelineService({
    dataDir,
    chatAdapter,
    aivideomakerApiKeys: allAivideomakerKeys,
    configStore,
    broadcastEvent: (e) => eventBridge.emit(e as WorkbenchEvent),
    getAccounts: () => workbench.resources.all().map(a => ({
      provider: a.provider,
      profileDir: a.profileDir,
      quotaExhausted: a.quotaExhausted,
    })),
    getVideoConfig: () => workbench.resources.getVideoProviderConfig(),
    pluginRegistry: getGlobalPluginRegistry(),
    onApiKeysChanged: (keys) => workbench.resources.syncApiKeys(keys),
  });

  return {
    workbench,
    pipelineService,
    eventBridge,
  };
}

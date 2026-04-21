import { afterEach, describe, expect, it, vi } from 'vitest';

type SourcesShape = Record<string, string>;

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function bootWithEnv(env: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...env };
  vi.resetModules();

  const info = vi.fn();
  const warn = vi.fn();

  vi.doMock('@ai-video/lib/logger.js', () => ({
    createLogger: vi.fn(() => ({
      info,
      warn,
      error: vi.fn(),
      debug: vi.fn(),
    })),
  }));

  vi.doMock('./bootstrap.js', () => ({
    bootstrapServerEnvironment: vi.fn(async () => ({
      port: 3000,
      dataDir: '/tmp/data',
      uploadDir: '/tmp/data/uploads',
      allowedOrigins: [],
      apiKey: '',
    })),
  }));

  vi.doMock('./wiring.js', () => ({
    createServerWiring: vi.fn(() => ({
      workbench: {},
      pipelineService: {},
      eventBridge: { setSink: vi.fn() },
    })),
  }));

  vi.doMock('./runtime.js', () => ({
    startServerRuntime: vi.fn(() => ({
      server: {},
      broadcastEvent: vi.fn(),
    })),
  }));

  vi.doMock('@ai-video/pipeline-core/providerPlugins.js', () => ({}));
  vi.doMock('@ai-video/pipeline-core/stageDefinitions.js', () => ({}));

  const { startServerApp } = await import('./main.js');
  await startServerApp();

  const configuredLog = info.mock.calls.find(
    (call) => call[0] === 'pipeline_core_ports_configured',
  );
  const sources = (configuredLog?.[1]?.sources ?? {}) as SourcesShape;
  return { sources, warn };
}

describe('server startup port source tags', () => {
  it('applies source priority per-port > global > default', async () => {
    const { sources } = await bootWithEnv({
      PIPELINE_CORE_PORT_SOURCE: 'env',
      PIPELINE_CORE_PORT_SOURCE_TAGS: JSON.stringify({
        chatAutomationPort: 'ops-hotfix',
      }),
    });

    expect(sources.chatAutomationPort).toBe('ops-hotfix');
    expect(sources.videoProviderPort).toBe('env');
  }, 15000);

  it('falls back to default when no override env exists', async () => {
    const { sources } = await bootWithEnv({
      PIPELINE_CORE_PORT_SOURCE: undefined,
      PIPELINE_CORE_PORT_SOURCE_TAGS: undefined,
    });

    expect(sources.responseParserPort).toBe('default');
  }, 15000);

  it('falls back when PIPELINE_CORE_PORT_SOURCE_TAGS is invalid JSON and warns', async () => {
    const { sources, warn } = await bootWithEnv({
      PIPELINE_CORE_PORT_SOURCE: 'env',
      PIPELINE_CORE_PORT_SOURCE_TAGS: '{not-json',
    });

    expect(sources.chatAutomationPort).toBe('env');
    expect(warn).toHaveBeenCalledWith(
      'pipeline_core_port_source_tags_parse_failed',
      expect.objectContaining({
        env: 'PIPELINE_CORE_PORT_SOURCE_TAGS',
      }),
    );
  }, 15000);
});

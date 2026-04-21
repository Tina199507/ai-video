import { describe, expect, it, vi } from 'vitest';

async function loadPortsModules() {
  vi.resetModules();
  const portsIndex = await import('./index.js');
  const portModules = await Promise.all([
    import('./adapterHostBindingsPort.js'),
    import('./chatAutomationPort.js'),
    import('./ffmpegAssemblerPort.js'),
    import('./responseParserPort.js'),
    import('./videoProviderPort.js'),
    import('./voiceStylePort.js'),
  ]);
  return { portsIndex, portModules };
}

describe('pipeline-core ports lifecycle', () => {
  it('allows configure before freeze and blocks configure/reset after freeze', async () => {
    const {
      portsIndex: {
        configurePipelineCorePorts,
        resetPipelineCorePorts,
        freezePipelineCorePorts,
        isPipelineCorePortsFrozen,
      },
      portModules,
    } = await loadPortsModules();
    const chatAutomationModule = portModules.find(m => 'defaultChatAutomationPort' in m);
    if (!chatAutomationModule || !('defaultChatAutomationPort' in chatAutomationModule)) {
      throw new Error('failed to load defaultChatAutomationPort');
    }

    configurePipelineCorePorts({ chatAutomationPort: chatAutomationModule.defaultChatAutomationPort });
    expect(isPipelineCorePortsFrozen()).toBe(false);

    freezePipelineCorePorts();
    expect(isPipelineCorePortsFrozen()).toBe(true);

    expect(() =>
      configurePipelineCorePorts({ chatAutomationPort: chatAutomationModule.defaultChatAutomationPort }),
    ).toThrow(/frozen/i);
    expect(() => resetPipelineCorePorts()).toThrow(/frozen/i);
  });

  it('blocks all direct set*/reset* port functions after freeze (table-driven)', async () => {
    const {
      portsIndex: { freezePipelineCorePorts },
      portModules,
    } = await loadPortsModules();

    freezePipelineCorePorts();

    /** Only the six façade ports use `assertPipelineCorePortsMutable`; `export *` surfaces also expose inner setRender* helpers. */
    const lockedSetters = new Set([
      'setAdapterHostBindingsPort',
      'setChatAutomationPort',
      'setFfmpegAssemblerPort',
      'setResponseParserPort',
      'setVideoProviderPort',
      'setVoiceStylePort',
    ]);
    const lockedResets = new Set([
      'resetAdapterHostBindingsPort',
      'resetChatAutomationPort',
      'resetFfmpegAssemblerPort',
      'resetResponseParserPort',
      'resetVideoProviderPort',
      'resetVoiceStylePort',
    ]);

    for (const moduleExports of portModules) {
      const entries = Object.entries(moduleExports) as Array<[string, unknown]>;
      const setFns = entries.filter(
        ([name, value]) => lockedSetters.has(name) && typeof value === 'function',
      );
      const resetFns = entries.filter(
        ([name, value]) => lockedResets.has(name) && typeof value === 'function',
      );

      for (const [setName, setFn] of setFns) {
        const defaultName = setName.replace(/^set/, 'default');
        const defaultValue = (moduleExports as Record<string, unknown>)[defaultName];
        expect(typeof defaultValue).toBeTruthy();
        expect(() => (setFn as (value: unknown) => void)(defaultValue)).toThrow(/frozen/i);
      }

      for (const [, resetFn] of resetFns) {
        expect(() => (resetFn as () => void)()).toThrow(/frozen/i);
      }
    }
  });
});

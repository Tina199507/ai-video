/**
 * hello-stage — reference stage plugin example.
 * Registers a PLUGIN_HELLO pipeline stage after REFINEMENT.
 */
export function register({ stageRegistry, services }) {
  stageRegistry.registerStage({ stage: 'PLUGIN_HELLO', after: 'REFINEMENT' });
  services?.logger?.info('hello-stage: PLUGIN_HELLO registered');
}

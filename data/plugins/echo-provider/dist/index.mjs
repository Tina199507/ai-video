/**
 * echo-provider — reference provider plugin example.
 * Registers an echo chat adapter that returns the prompt unchanged.
 */
export function register({ pluginRegistry, manifest, services }) {
  pluginRegistry.register({ id: manifest.id });
  services?.logger?.info('echo-provider: echo adapter registered');
}

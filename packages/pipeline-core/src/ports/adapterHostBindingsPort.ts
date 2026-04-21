import { registerAdapterHostBindings } from '../hostBindingsCore.js';
import { assertPipelineCorePortsMutable } from './lifecycle.js';

export interface AdapterHostBindingsPort {
  registerAdapterHostBindings: typeof registerAdapterHostBindings;
}

export const defaultAdapterHostBindingsPort: AdapterHostBindingsPort = {
  registerAdapterHostBindings,
};

let activeAdapterHostBindingsPort: AdapterHostBindingsPort = defaultAdapterHostBindingsPort;

export function setAdapterHostBindingsPort(port: AdapterHostBindingsPort): void {
  assertPipelineCorePortsMutable('set adapterHostBindingsPort');
  activeAdapterHostBindingsPort = port;
}

export function resetAdapterHostBindingsPort(): void {
  assertPipelineCorePortsMutable('reset adapterHostBindingsPort');
  activeAdapterHostBindingsPort = defaultAdapterHostBindingsPort;
}

export function getAdapterHostBindingsPort(): AdapterHostBindingsPort {
  return activeAdapterHostBindingsPort;
}

export const registerAdapterHostBindingsPort: typeof registerAdapterHostBindings = (...args) =>
  getAdapterHostBindingsPort().registerAdapterHostBindings(...args);

export { registerAdapterHostBindingsPort as registerAdapterHostBindings };

let portsFrozen = false;

export function freezePipelineCorePortsLifecycle(): void {
  portsFrozen = true;
}

export function arePipelineCorePortsFrozen(): boolean {
  return portsFrozen;
}

export function assertPipelineCorePortsMutable(action: string): void {
  if (portsFrozen) {
    throw new Error(`pipeline-core ports are frozen; cannot ${action} at runtime`);
  }
}

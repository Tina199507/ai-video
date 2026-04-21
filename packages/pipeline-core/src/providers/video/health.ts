/**
 * Port layer for provider-health monitor.
 */
import { videoHealthMonitor as defaultVideoHealthMonitor } from './health.impl.js';

export let videoHealthMonitor = defaultVideoHealthMonitor;

export function setVideoHealthMonitorPort(next: typeof defaultVideoHealthMonitor): void {
  videoHealthMonitor = next;
}

export function resetVideoHealthMonitorPort(): void {
  videoHealthMonitor = defaultVideoHealthMonitor;
}

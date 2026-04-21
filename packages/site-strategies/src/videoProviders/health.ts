/* ------------------------------------------------------------------ */
/*  Shared video provider health singleton                            */
/* ------------------------------------------------------------------ */

import { VideoProviderHealthMonitor } from '@ai-video/adapter-common/videoProviderHealth.js';

export const videoHealthMonitor = new VideoProviderHealthMonitor();

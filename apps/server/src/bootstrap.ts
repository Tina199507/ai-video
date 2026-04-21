import { join } from 'node:path';
import { resolveDataDir, resolveSubDir } from './dataDir.js';
import { migrateGlobalStoresToSqlite } from '@ai-video/lib/autoMigrateGlobal.js';
import {
  loadAndRegisterPlugins,
  migrateProjectsToSqlite,
  registerStage,
} from '@ai-video/pipeline-core/index.js';
import { getGlobalPluginRegistry } from '@ai-video/pipeline-core/providerRegistry.js';
import { createLogger, type Logger } from '@ai-video/lib/logger.js';
import { installPipelineMetrics } from '@ai-video/pipeline-core/metrics.js';
import { BACKEND_PORT } from './constants.js';

export interface ServerBootstrapResult {
  port: number;
  dataDir: string;
  uploadDir: string;
  allowedOrigins: string[];
  apiKey: string;
}

export async function bootstrapServerEnvironment(
  logger: Logger = createLogger('server'),
): Promise<ServerBootstrapResult> {
  // Boot-time hook: subscribe Prometheus counters to retry observations
  // before any pipeline run can emit them.  Idempotent.
  installPipelineMetrics();

  const port = BACKEND_PORT;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    logger.error('invalid_port', undefined, { value: process.env.PORT });
    process.exit(1);
  }

  const dataDir = resolveDataDir();
  const uploadDir = resolveSubDir(dataDir, 'uploads');

  // Boot-time auto-migration: when PROJECT_STORE_BACKEND=sqlite is set
  // (D-2), promote any legacy json projects to the new layout before
  // PipelineService opens its first KV handle.
  try {
    const migration = migrateProjectsToSqlite({ projectsDir: join(dataDir, 'projects') });
    if (migration.migrated > 0 || migration.failed > 0) {
      logger.info('project_store_migration', {
        total: migration.total,
        migrated: migration.migrated,
        alreadyMigrated: migration.alreadyMigrated,
        skipped: migration.skipped,
        failed: migration.failed,
      });
    }
  } catch (err) {
    logger.error(
      'project_store_migration_failed',
      err instanceof Error ? err : undefined,
      err instanceof Error ? undefined : { error: String(err) },
    );
  }

  // D-3: when GLOBAL_STORE_BACKEND=sqlite, promote root-level
  // resources/models/providers/selector-cache JSON files into a shared
  // data/global.db before Workbench opens its KV handle.
  try {
    const globalMigration = migrateGlobalStoresToSqlite({ dataDir });
    if (globalMigration.ran && (globalMigration.migrated > 0 || globalMigration.failed > 0)) {
      logger.info('global_store_migration', {
        migrated: globalMigration.migrated,
        skipped: globalMigration.skipped,
        failed: globalMigration.failed,
      });
    }
  } catch (err) {
    logger.error(
      'global_store_migration_failed',
      err instanceof Error ? err : undefined,
      err instanceof Error ? undefined : { error: String(err) },
    );
  }

  // Optional loading of out-of-tree stage / provider plugins.
  if (process.env.ENABLE_PLUGINS === '1') {
    const pluginsRoot = process.env.PLUGINS_DIR || join(dataDir, 'plugins');
    const trustFile = process.env.PLUGIN_TRUST_FILE || join(dataDir, 'trusted-plugins.json');
    try {
      const result = await loadAndRegisterPlugins(
        {
          stageRegistry: { registerStage },
          pluginRegistry: getGlobalPluginRegistry(),
        },
        {
          pluginsRoot,
          trustFilePath: trustFile,
          strict: process.env.PLUGIN_STRICT === '1',
        },
      );
      logger.info('plugins_loaded', {
        loaded: result.loaded.length,
        skipped: result.skipped.length,
        ids: result.loaded.map(p => p.manifest.id),
      });
      for (const skip of result.skipped) {
        logger.warn('plugin_skipped', { id: skip.id, source: skip.source, reason: skip.reason });
      }
    } catch (err) {
      logger.error(
        'plugins_load_failed',
        err instanceof Error ? err : undefined,
        err instanceof Error ? undefined : { error: String(err) },
      );
      if (process.env.PLUGIN_STRICT === '1') throw err;
    }
  }

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const apiKey = process.env.API_KEY || '';

  return {
    port,
    dataDir,
    uploadDir,
    allowedOrigins,
    apiKey,
  };
}

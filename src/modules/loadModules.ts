import type { Logger } from '@/shared/utils/logger';

import { availableModules, devModeModules } from '@/config/deployment.config';
import type { ModuleDefinition, ModuleFactory } from '@/core/http/types';

/**
 * Memuat definisi modul secara dinamis berdasarkan loader yang terdaftar.
 * @param moduleName Nama modul untuk keperluan logging.
 * @param loader Fungsi pemanggil modul yang mengembalikan factory.
 * @param logger Logger aplikasi untuk mencatat error.
 */
async function loadModuleDefinition(
  moduleName: string,
  loader: () => Promise<ModuleFactory>,
  logger: Logger,
): Promise<ModuleDefinition | null> {
  try {
    const factory = await loader();
    const result = factory();
    const routes = Array.isArray(result) ? result : result.routes;
    const options = Array.isArray(result) ? undefined : result.options;
    return {
      prefix: `/api/v1/${moduleName}`,
      routes,
      options,
    };
  } catch (error) {
    logger.error(
      `❌ Failed while executing module factory for "${moduleName}"`,
      error as Error,
    );
    return null;
  }
}

/**
 * Mengumpulkan seluruh modul yang dikonfigurasi untuk mode development.
 * @param logger Logger aplikasi untuk mencatat peringatan dan error.
 */
export async function loadConfiguredModules(logger: Logger): Promise<ModuleDefinition[]> {
  const modules: ModuleDefinition[] = [];

  for (const moduleName of devModeModules) {
    const loader = availableModules[moduleName];
    if (!loader) {
      logger.error(
        `⚠️ Module "${moduleName}" tidak ditemukan di availableModules`,
        new Error('Module not found'),
      );
      continue;
    }

    const definition = await loadModuleDefinition(moduleName, loader, logger);
    if (definition) {
      modules.push(definition);
    }
  }

  return modules;
}

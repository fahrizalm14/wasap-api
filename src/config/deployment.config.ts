import type { ModuleFactory } from '@/core/http/types';
type ModuleLoader = () => Promise<ModuleFactory>;

export const availableModules: Record<string, ModuleLoader> = {
  users: async () => (await import('@/modules/users/users.routes')).default,
  whatsapp: async () =>
    (await import('@/modules/whatsapp/whatsapp.routes')).default,
  // 'products': async () => (await import('@/modules/products/products.routes')).default,
};

type AvailableModuleName = keyof typeof availableModules;

interface DeploymentTarget {
  port: number;
  modules: AvailableModuleName[];
}

export const deploymentTargets: Record<string, DeploymentTarget> = {
  'main-api': { port: 2001, modules: ['users', 'whatsapp'] },
};

export const devModeModules: AvailableModuleName[] = ['users', 'whatsapp'];

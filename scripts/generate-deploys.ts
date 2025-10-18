import fs from 'fs/promises';
import path from 'path';
import { deploymentTargets } from '../src/config/deployment.config';

import { formatWithPrettier } from './utils/prettier';

/**
 * (BARU) Template untuk package.json yang akan di-generate untuk setiap service.
 * Skrip 'start' sekarang menunjuk ke file main.js yang sesuai.
 */
const getPackageJsonTemplate = (
  targetName: string,
  mainDeps: Record<string, string>,
) => {
  const minimalPackageJson = {
    name: targetName,
    version: '1.0.0',
    private: true,
    main: `dist/main.js`, // Menunjuk ke file main yang unik
    scripts: {
      start: `node dist/main.js`,
    },
    dependencies: mainDeps, // Hanya dependensi produksi
  };
  return JSON.stringify(minimalPackageJson, null, 2);
};

/**
 * (DIPERBARUI) Dockerfile sekarang menggunakan pnpm start.
 */
const getDockerfileTemplate = (targetName: string, port: number) => `
# ===================================================================
# Tahap 1: BUILDER - Instal semua dependensi & kompilasi kode
# ===================================================================
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install
COPY . .
RUN pnpm build

# ===================================================================
# Tahap 2: PRODUCTION - Image final yang ramping
# ===================================================================
FROM node:20-alpine
WORKDIR /app

# Salin package.json yang di-generate khusus untuk service ini
COPY ./deploys/${targetName}/package.json ./package.json

# Instal HANYA dependensi produksi berdasarkan package.json baru
RUN npm install -g pnpm && pnpm install --prod

# Salin hasil build dari tahap 'builder'
COPY --from=builder /app/dist ./dist

# Salin file .env.production
COPY ./deploys/${targetName}/.env.production ./.env

EXPOSE ${port}
# Jalankan aplikasi menggunakan skrip start standar
CMD ["pnpm", "start"]
`;

const getEnvTemplate = (port: number) => `NODE_ENV=production\nPORT=${port}`;

const writeFormattedFile = async (filePath: string, contents: string) => {
  const formattedContents = await formatWithPrettier(filePath, contents);
  await fs.writeFile(filePath, formattedContents);
};

/**
 * Fungsi utama skrip.
 */
async function generateFiles() {
  console.log('🚀 Starting deployment file generation...');
  const deploysDir = path.join(process.cwd(), 'deploys');
  await fs.mkdir(deploysDir, { recursive: true });

  // Baca package.json utama untuk mendapatkan daftar dependensi produksi
  const mainPackageJson = JSON.parse(
    await fs.readFile('package.json', 'utf-8'),
  );
  const prodDependencies = mainPackageJson.dependencies;

  for (const [targetName, config] of Object.entries(deploymentTargets)) {
    console.log(`\nProcessing deployment target: "${targetName}"`);
    const targetDir = path.join(deploysDir, targetName);
    await fs.mkdir(targetDir, { recursive: true });

    // 1. Generate package.json mini
    const packageJsonContent = getPackageJsonTemplate(
      targetName,
      prodDependencies,
    );
    await writeFormattedFile(
      path.join(targetDir, 'package.json'),
      packageJsonContent,
    );
    console.log(` ✓ package.json created in ${targetDir}`);

    // 2. Generate file .env.production
    const envContent = getEnvTemplate(config.port);
    await writeFormattedFile(
      path.join(targetDir, '.env.production'),
      envContent,
    );
    console.log(` ✓ .env.production created in ${targetDir}`);

    // 3. Generate Dockerfile
    const dockerfileContent = getDockerfileTemplate(targetName, config.port);
    await writeFormattedFile(
      path.join(targetDir, 'Dockerfile'),
      dockerfileContent,
    );
    console.log(` ✓ Dockerfile created in ${targetDir}`);

    // 4. Generate file main.js yang unik di dalam /dist
    // const modulesForTarget = config.modules.map((name) => ({
    //   name,
    //   path: availableModules[name].path,
    // }));
    // const mainContent = getMainTemplate(config.port, modulesForTarget);
    // await fs.writeFile(
    //   path.join(process.cwd(), 'dist', `main.${targetName}.js`),
    //   mainContent,
    // );
    // console.log(` ✓ main.${targetName}.js created in /dist`);
  }
  console.log('\n✨ All deployment files generated successfully!');
}

generateFiles().catch(console.error);

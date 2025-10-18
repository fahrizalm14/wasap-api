import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';

import { formatWithPrettier } from './utils/prettier';

type RepositoryOption = 'in-memory' | 'prisma';

const toPascalCase = (value: string) =>
  value.replace(/(^\w|-\w)/g, (group) => group.replace('-', '').toUpperCase());

const toConstantCase = (value: string) => value.replace(/-/g, '_').toUpperCase();

const getRoutesTemplate = (name: string, pascal: string) => `import { container } from 'tsyringe';

import { ModuleBuildResult, RouteDefinition } from '@/core/http/types';
import { ${pascal}Controller } from '@/modules/${name}/${name}.controller';
import '@/modules/${name}/${name}.container';

const controller = container.resolve(${pascal}Controller);

const routes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/',
    handler: async () => {
      const items = await controller.list();

      return {
        status: 200,
        body: { status: 'success', data: items },
      };
    },
  },
];

export default function create${pascal}Module(): ModuleBuildResult {
  return { routes };
}
`;

const getControllerTemplate = (name: string, pascal: string) => `import { inject, injectable } from 'tsyringe';

import { ${pascal}Service } from '@/modules/${name}/${name}.service';
import type { I${pascal} } from '@/modules/${name}/${name}.interface';

@injectable()
export class ${pascal}Controller {
  constructor(@inject(${pascal}Service) private readonly service: ${pascal}Service) {}

  async list(): Promise<I${pascal}[]> {
    return this.service.findAll();
  }
}
`;

const getServiceTemplate = (
  name: string,
  pascal: string,
  repositoryToken: string,
) => `import { inject, injectable } from 'tsyringe';

import type { I${pascal}, I${pascal}Repository } from '@/modules/${name}/${name}.interface';
import { ${repositoryToken} } from '@/modules/${name}/${name}.interface';

@injectable()
export class ${pascal}Service {
  constructor(
    @inject(${repositoryToken}) private readonly repository: I${pascal}Repository,
  ) {}

  findAll(): Promise<I${pascal}[]> {
    return this.repository.findAll();
  }
}
`;

const getInterfaceTemplate = (name: string, pascal: string, repositoryToken: string) => `export interface I${pascal} {
  id: number;
  name: string;
}

export interface I${pascal}Repository {
  findAll(): Promise<I${pascal}[]>;
}

export const ${repositoryToken} = Symbol('${repositoryToken}');
`;

const getInMemoryRepositoryTemplate = (
  name: string,
  pascal: string,
) => `import { singleton } from 'tsyringe';

import type { I${pascal}, I${pascal}Repository } from '@/modules/${name}/${name}.interface';

const DEFAULT_${toConstantCase(name)}: I${pascal}[] = [
  { id: 1, name: 'Sample ${pascal}' },
];

@singleton()
export class ${pascal}Repository implements I${pascal}Repository {
  async findAll(): Promise<I${pascal}[]> {
    return DEFAULT_${toConstantCase(name)};
  }
}
`;

const getPrismaRepositoryTemplate = (name: string, pascal: string) => `import { inject, injectable } from 'tsyringe';

import { PrismaService } from '@/shared/infra/database/prisma';
import type { I${pascal}, I${pascal}Repository } from '@/modules/${name}/${name}.interface';

@injectable()
export class Prisma${pascal}Repository implements I${pascal}Repository {
  constructor(@inject(PrismaService) private readonly prismaService: PrismaService) {}

  async findAll(): Promise<I${pascal}[]> {
    const prisma = this.prismaService.getClient();
    void prisma;

    /**
     * TODO: Ganti implementasi berikut dengan query Prisma yang sesuai.
     * Contoh: return prisma.example.findMany();
     */
    return [];
  }
}
`;

const getContainerTemplate = (
  name: string,
  repositoryToken: string,
  repositoryClass: string,
  repositoryFile: string,
  useSingletonRegistration: boolean,
) => `import { container } from 'tsyringe';

import { ${repositoryClass} } from '@/modules/${name}/${repositoryFile}';
import { ${repositoryToken} } from '@/modules/${name}/${name}.interface';

container.${useSingletonRegistration ? 'registerSingleton' : 'register'}(
  ${repositoryToken},
  ${repositoryClass},
);
`;

const getServiceSpecTemplate = (
  name: string,
  pascal: string,
  repositoryToken: string,
) => `import 'reflect-metadata';
import { container } from 'tsyringe';

import type { I${pascal} } from '@/modules/${name}/${name}.interface';
import { ${repositoryToken} } from '@/modules/${name}/${name}.interface';
import { ${pascal}Service } from '@/modules/${name}/${name}.service';

const mockRepository = {
  findAll: jest.fn(),
};

describe('${pascal}Service', () => {
  let service: ${pascal}Service;

  beforeEach(() => {
    jest.clearAllMocks();
    container.register(${repositoryToken}, {
      useValue: mockRepository,
    });
    service = container.resolve(${pascal}Service);
  });

  it('should call findAll on the repository when fetching all items', async () => {
    const mockData: I${pascal}[] = [{ id: 1, name: 'Test Item' }];
    mockRepository.findAll.mockResolvedValue(mockData);

    const result = await service.findAll();

    expect(result).toEqual(mockData);
    expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
  });
});
`;

async function createModule() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'moduleName',
      message: 'Enter new module name (e.g., products):',
      validate: (input: string) =>
        /^[a-z]+(-[a-z]+)*$/.test(input) ||
        'Please use lowercase letters and single hyphens only.',
    },
    {
      type: 'list',
      name: 'repositoryType',
      message: 'Select repository implementation:',
      choices: [
        { name: 'In-memory (default sample data)', value: 'in-memory' },
        { name: 'Prisma (requires PrismaService)', value: 'prisma' },
      ],
    },
  ]);

  const name: string = answers.moduleName.toLowerCase();
  const repositoryType = answers.repositoryType as RepositoryOption;

  const pascalName = toPascalCase(name);
  const repositoryToken = `${toConstantCase(name)}_REPOSITORY_TOKEN`;

  const moduleDir = path.join(process.cwd(), 'src', 'modules', name);
  await fs.mkdir(moduleDir, { recursive: true });

  const files: Array<{ fileName: string; contents: string }> = [
    { fileName: `${name}.routes.ts`, contents: getRoutesTemplate(name, pascalName) },
    { fileName: `${name}.controller.ts`, contents: getControllerTemplate(name, pascalName) },
    { fileName: `${name}.service.ts`, contents: getServiceTemplate(name, pascalName, repositoryToken) },
    { fileName: `${name}.interface.ts`, contents: getInterfaceTemplate(name, pascalName, repositoryToken) },
    { fileName: `${name}.service.spec.ts`, contents: getServiceSpecTemplate(name, pascalName, repositoryToken) },
  ];

  if (repositoryType === 'in-memory') {
    files.push({
      fileName: `${name}.repository.ts`,
      contents: getInMemoryRepositoryTemplate(name, pascalName),
    });
    files.push({
      fileName: `${name}.container.ts`,
      contents: getContainerTemplate(
        name,
        repositoryToken,
        `${pascalName}Repository`,
        `${name}.repository`,
        true,
      ),
    });
  } else {
    files.push({
      fileName: `${name}.prisma.repository.ts`,
      contents: getPrismaRepositoryTemplate(name, pascalName),
    });
    files.push({
      fileName: `${name}.container.ts`,
      contents: getContainerTemplate(
        name,
        repositoryToken,
        `Prisma${pascalName}Repository`,
        `${name}.prisma.repository`,
        true,
      ),
    });
  }

  console.log(`\nCreating module "${name}" using ${repositoryType} repository...\n`);

  for (const file of files) {
    const targetPath = path.join(moduleDir, file.fileName);
    const formattedContents = await formatWithPrettier(targetPath, file.contents);
    await fs.writeFile(targetPath, formattedContents);
    console.log(` ✓ Created ${path.relative(process.cwd(), targetPath)}`);
  }

  console.log(`\n🎉 Module "${pascalName}" created successfully!`);
  console.log(
    "\nIMPORTANT: Don't forget to manually update 'src/config/deployment.config.ts':",
  );
  console.log(`1. Add '${name}' to 'availableModules'.`);
  console.log(`2. Add '${name}' to 'devModeModules' to run it in development.`);

  if (repositoryType === 'prisma') {
    console.log(
      '\nℹ️  Prisma reminder: buat/ubah model di prisma/schema.prisma, jalankan "pnpm prisma migrate dev", lalu "pnpm prisma generate".',
    );
  }
}

createModule().catch((error) => {
  console.error('❌ Failed to create module:', error);
  process.exit(1);
});

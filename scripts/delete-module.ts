import fs from 'fs/promises';
import inquirer from 'inquirer';
import path from 'path';

// Fungsi utama skrip
async function deleteModule() {
  const modulesDir = path.join(process.cwd(), 'src', 'modules');
  const moduleChoices = (await fs.readdir(modulesDir, { withFileTypes: true }))
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  if (moduleChoices.length === 0) {
    console.log('No modules available to delete.');
    return;
  }

  const { modulesToDelete, confirmDelete } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'modulesToDelete',
      message: 'Which module(s) do you want to delete?',
      choices: moduleChoices,
      validate: (answer) =>
        answer.length >= 1 || 'You must choose at least one module.',
    },
    {
      type: 'confirm',
      name: 'confirmDelete',
      message: (answers) =>
        `Permanently delete: ${answers.modulesToDelete.join(', ')}? This cannot be undone.`,
      default: false,
      when: (answers) => answers.modulesToDelete.length > 0,
    },
  ]);

  if (!confirmDelete) {
    console.log('Deletion cancelled.');
    return;
  }

  for (const moduleName of modulesToDelete) {
    console.log(`\nDeleting module "${moduleName}"...`);
    const moduleDir = path.join(modulesDir, moduleName);

    try {
      await fs.rm(moduleDir, { recursive: true, force: true });
      console.log(` ✓ Directory deleted: ${moduleDir}`);
    } catch (error) {
      console.error(`❌ Error deleting directory for ${moduleName}:`, error);
    }
  }

  console.log('\n🎉 Module directory deletion finished.');
  console.log(
    "\nIMPORTANT: Don't forget to manually remove the module(s) from 'src/config/deployment.config.ts'.",
  );
}

deleteModule();

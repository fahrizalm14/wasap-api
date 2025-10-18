let prettierInstance: typeof import('prettier') | null = null;

const loadPrettier = async () => {
  if (!prettierInstance) {
    prettierInstance = await import('prettier');
  }

  return prettierInstance;
};

export const formatWithPrettier = async (
  filePath: string,
  contents: string,
): Promise<string> => {
  try {
    const prettier = await loadPrettier();
    const config = (await prettier.resolveConfig(filePath)) ?? {};

    return prettier.format(contents, {
      ...config,
      filepath: filePath,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('No parser could be inferred') ||
        error.message.includes('prettier.getFileInfo.sync is not a function'))
    ) {
      return contents;
    }

    throw error;
  }
};

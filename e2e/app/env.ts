/**
 * This process's environment, read in one place: the tests and the catalog-install script hand it to child
 * processes.
 */
export const env: Readonly<Record<string, string | undefined>> = process.env;

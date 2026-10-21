import type { Page } from "@playwright/test";

/** As linhas da lista de arquivos, sem a do cabeçalho. */
export const rowsOf = (page: Page) =>
  page.getByRole("table").getByRole("row").filter({ has: page.getByRole("cell") });

/** A linha do item de nome `name`. */
export const rowOf = (page: Page, name: string) => rowsOf(page).filter({ hasText: name });

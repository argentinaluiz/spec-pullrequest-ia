import { expect, test } from "@playwright/test";
import { signIn } from "./support/account";
import { seedRootFiles, withDatabase } from "./support/items";
import { uniqueEmail } from "./support/mailpit";

test("grava os arquivos ativos na Pasta raiz do Usuário, com os campos pedidos", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  const updatedAt = new Date("2026-10-13T01:30:00.000Z");

  await seedRootFiles(email, [
    {
      name: "relatório.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2516582,
      updatedAt,
    },
    { name: "notas.txt" },
  ]);

  const rows = await withDatabase(async (client) => {
    const result = await client.query(
      `SELECT child.name, child.type, child.status, child.size_bytes::int AS size,
              child.mime_type, child.updated_at
         FROM items child
         JOIN items root ON root.id = child.parent_id AND root.parent_id IS NULL
         JOIN users ON users.id = root.owner_id
        WHERE users.email = $1
        ORDER BY child.name`,
      [email],
    );
    return result.rows;
  });
  expect(rows).toEqual([
    {
      name: "notas.txt",
      type: "file",
      status: "active",
      size: 1024,
      mime_type: "text/plain",
      updated_at: expect.any(Date),
    },
    {
      name: "relatório.pdf",
      type: "file",
      status: "active",
      size: 2516582,
      mime_type: "application/pdf",
      updated_at: updatedAt,
    },
  ]);
});

test("recusa gravar para um Usuário que ainda não abriu a Pasta raiz", async () => {
  const seed = seedRootFiles(uniqueEmail(), [{ name: "a.txt" }]);

  await expect(seed).rejects.toThrow(/ainda não tem a Pasta raiz/);
});

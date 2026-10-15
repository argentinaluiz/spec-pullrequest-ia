import { withDatabase } from "./items";

/**
 * Deixa a Cota do Usuário cheia, no limite do plano gratuito: nenhuma tela produz esse estado,
 * então a linha de `quotas` é gravada direto no banco da API que a web usa. O Usuário já tem de
 * existir.
 */
export async function fillQuota(email: string) {
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO quotas (user_id, plan_id, used_bytes, updated_at)
       SELECT users.id, plans.id, plans.storage_bytes, now()
         FROM users, plans
        WHERE users.email = $1 AND plans.code = 'free'
       ON CONFLICT (user_id) DO UPDATE SET used_bytes = EXCLUDED.used_bytes`,
      [email],
    );
  });
}

/** Quantos bytes a Cota do Usuário conta, pelo banco da API. Sem a linha de `quotas`, 0. */
export async function usedBytesOf(email: string): Promise<number> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ used_bytes: string }>(
      `SELECT quotas.used_bytes FROM quotas JOIN users ON users.id = quotas.user_id
        WHERE users.email = $1`,
      [email],
    );
    return rows[0] ? Number(rows[0].used_bytes) : 0;
  });
}

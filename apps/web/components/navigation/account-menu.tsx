"use client";

import { LogOut } from "lucide-react";
import { Menu, MenuHeader, MenuItem, MenuSeparator } from "@/components/ui/menu";

type AccountMenuProps = {
  email: string;
  /** A Server Action de sair, que apaga os cookies e leva à tela de entrar. */
  logout: () => Promise<void>;
};

/**
 * O `{component.account-menu}`: o círculo com a inicial do Usuário, que abre o menu com o
 * e-mail e "Sair". O plano e "Planos" entram com a funcionalidade de planos.
 */
export function AccountMenu({ email, logout }: AccountMenuProps) {
  return (
    <Menu
      label={`Conta de ${email}`}
      // O círculo tem 32px, e a área de toque sobe para 44px abaixo de `lg`.
      triggerClassName="focus-ring flex size-11 shrink-0 items-center justify-center rounded-full transition-[scale] duration-150 active:scale-95 motion-reduce:active:scale-100 lg:size-8"
      trigger={<AccountInitial email={email} />}
    >
      <MenuHeader>
        <p className="truncate text-ui text-ink">{email}</p>
      </MenuHeader>
      <MenuSeparator />
      <form action={logout}>
        <MenuItem type="submit" icon={LogOut}>
          Sair
        </MenuItem>
      </form>
    </Menu>
  );
}

export function AccountInitial({ email }: { email: string }) {
  return (
    <span
      aria-hidden
      className="flex size-8 items-center justify-center rounded-full bg-surface text-ui-strong text-ink hover-overlay"
    >
      {email.trim().charAt(0).toUpperCase()}
    </span>
  );
}

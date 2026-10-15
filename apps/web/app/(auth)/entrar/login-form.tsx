"use client";

import { useActionState, useId, type ReactNode } from "react";
import { Banner } from "@/components/ui/banner";
import { ButtonPrimary } from "@/components/ui/button-primary";
import { PasswordField } from "@/components/ui/password-field";
import { TextLink } from "@/components/ui/text-link";
import { RETURN_PARAM } from "@/lib/session/return-path";
import { EmailField } from "../email-field";
import { login } from "../actions";
import type { LoginFormState } from "../form-state";

const INITIAL_STATE: LoginFormState = {};

type LoginFormProps = {
  /** A página pedida antes do login, lida da URL antes de o formulário ser renderizado. */
  returnTo?: string;
  /** O aviso que chegou de outro fluxo. Dá lugar ao aviso do próprio formulário. */
  notice?: ReactNode;
};

/*
 * O destino entra pronto, antes do formulário. O aviso depende da URL, entra por prop e chega
 * depois dos campos, para que eles não sejam trocados no meio da digitação.
 */
export function LoginForm({ returnTo, notice }: LoginFormProps) {
  const [state, action, pending] = useActionState(login, INITIAL_STATE);
  const resendFormId = useId();

  return (
    <>
      {/* A validação é da Server Action: a do navegador mostraria balões fora do design. */}
      <form action={action} noValidate className="flex flex-col gap-6">
        {returnTo !== undefined && (
          <input type="hidden" name={RETURN_PARAM} value={returnTo} />
        )}
        {formNotice(state, pending, resendFormId) ?? notice}
        <div className="flex flex-col gap-4">
          <EmailField
            defaultValue={state.email}
            error={state.fieldErrors?.email}
          />
          <PasswordField
            label="Senha"
            name="password"
            autoComplete="current-password"
            error={state.fieldErrors?.password}
          />
        </div>
        <ButtonPrimary type="submit" fullWidth loading={pending}>
          Entrar
        </ButtonPrimary>
      </form>
      {/*
        O reenvio tem um formulário próprio, e o botão do aviso aponta para ele. Dentro do
        formulário de entrar, ele viria antes do "Entrar" e seria o botão que a tecla Enter aciona.
      */}
      {state.unverifiedEmail && (
        <form id={resendFormId} action={action} className="hidden">
          <input type="hidden" name="intent" value="resend" />
          <input
            type="hidden"
            name="unverifiedEmail"
            value={state.unverifiedEmail}
          />
        </form>
      )}
    </>
  );
}

/** O aviso que o último envio do formulário produziu, se houver. */
function formNotice(
  state: LoginFormState,
  pending: boolean,
  resendFormId: string,
): ReactNode {
  if (state.verificationSent) {
    return (
      <Banner variant="success" layout="narrow">
        Enviamos um novo link. Confira sua caixa de entrada.
      </Banner>
    );
  }
  if (state.unverifiedEmail) {
    return (
      <Banner
        variant="error"
        layout="narrow"
        action={
          <TextLink type="submit" form={resendFormId} disabled={pending}>
            Reenviar e-mail
          </TextLink>
        }
      >
        {state.formError}
      </Banner>
    );
  }
  if (state.formError) {
    return (
      <Banner variant="error" layout="narrow">
        {state.formError}
      </Banner>
    );
  }
  return null;
}

import { Suspense } from "react";
import { AccountMenu } from "@/components/navigation/account-menu";
import { AppBar } from "@/components/navigation/app-bar";
import { Sidebar } from "@/components/navigation/sidebar";
import { SidebarDrawer } from "@/components/navigation/sidebar-drawer";
import { getCurrentUser } from "@/lib/dal/user";
import { ToastProvider } from "@/components/ui/toast";
import { UploadButton } from "@/components/uploads/upload-button";
import { UploadPanel } from "@/components/uploads/upload-panel";
import { UploadProvider } from "@/components/uploads/upload-provider";
import { UploadUserBinder } from "@/components/uploads/upload-user-binder";
import { cancelUpload, completeUpload, logout, resumeUpload, startUpload } from "./actions";

async function CurrentAccountMenu() {
  const user = await getCurrentUser();
  return (
    <>
      <AccountMenu email={user.email} logout={logout} />
      {/* Na mesma fronteira do menu, para não segurar a casca: os incompletos voltam quando a Sessão é conferida. */}
      <UploadUserBinder userId={user.id} />
    </>
  );
}

/** O lugar do menu da conta enquanto o Usuário é conferido na API. */
function AccountMenuPlaceholder() {
  return (
    <div className="flex size-11 shrink-0 items-center justify-center lg:size-8">
      <span className="size-8 rounded-full bg-surface" />
    </div>
  );
}

/**
 * A casca do Drive (docs/lld.md, seção 7.1): a barra superior, a navegação, fixa a partir de
 * `lg` e em gaveta abaixo disso, a área de conteúdo de cada página e o painel de envios, que
 * vive no provider do layout para um envio seguir enquanto a pessoa navega.
 */
export default function DriveLayout({ children }: LayoutProps<"/">) {
  return (
    <ToastProvider>
      <UploadProvider
        startUpload={startUpload}
        completeUpload={completeUpload}
        cancelUpload={cancelUpload}
        resumeUpload={resumeUpload}
      >
        <div className="flex flex-1 flex-col bg-canvas">
          <AppBar
            // O caminho e a pasta aberta só se sabem na requisição em `/pasta/[id]`: cada peça que
            // os lê fica no próprio `<Suspense>`, para a casca continuar pré-renderizada.
            navigation={
              <Suspense fallback={null}>
                <SidebarDrawer>
                  <Sidebar />
                </SidebarDrawer>
              </Suspense>
            }
            upload={
              <Suspense fallback={null}>
                <UploadButton />
              </Suspense>
            }
            account={
              <Suspense fallback={<AccountMenuPlaceholder />}>
                <CurrentAccountMenu />
              </Suspense>
            }
          />
          <div className="flex flex-1">
            <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 bg-surface p-3 lg:block">
              <Suspense fallback={null}>
                <Sidebar />
              </Suspense>
            </aside>
            {children}
          </div>
        </div>
        <UploadPanel />
      </UploadProvider>
    </ToastProvider>
  );
}

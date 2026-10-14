import { Suspense } from "react";
import { AccountMenu } from "@/components/navigation/account-menu";
import { AppBar } from "@/components/navigation/app-bar";
import { Sidebar } from "@/components/navigation/sidebar";
import { SidebarDrawer } from "@/components/navigation/sidebar-drawer";
import { getCurrentUser } from "@/lib/dal/user";
import { UploadButton } from "@/components/uploads/upload-button";
import { UploadPanel } from "@/components/uploads/upload-panel";
import { UploadProvider } from "@/components/uploads/upload-provider";
import { completeUpload, logout, startUpload } from "./actions";

async function CurrentAccountMenu() {
  const user = await getCurrentUser();
  return <AccountMenu email={user.email} logout={logout} />;
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
    <UploadProvider startUpload={startUpload} completeUpload={completeUpload}>
      <div className="flex flex-1 flex-col bg-canvas">
        <AppBar
          navigation={
            <SidebarDrawer>
              <Sidebar />
            </SidebarDrawer>
          }
          upload={<UploadButton />}
          account={
            <Suspense fallback={<AccountMenuPlaceholder />}>
              <CurrentAccountMenu />
            </Suspense>
          }
        />
        <div className="flex flex-1">
          <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 bg-surface p-3 lg:block">
            <Sidebar />
          </aside>
          {children}
        </div>
      </div>
      <UploadPanel />
    </UploadProvider>
  );
}

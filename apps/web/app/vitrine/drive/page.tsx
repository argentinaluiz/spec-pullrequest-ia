import { CloudUpload } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/files/empty-state";
import { FileList } from "@/components/files/file-list";
import { FileRow } from "@/components/files/file-row";
import { toFileRow } from "@/components/files/format";
import {
  LoadedRows,
  LoadMoreButton,
  LoadMoreProvider,
  type LoadMoreResult,
} from "@/components/files/load-more";
import { AccountMenu } from "@/components/navigation/account-menu";
import { AppBar } from "@/components/navigation/app-bar";
import { Sidebar } from "@/components/navigation/sidebar";
import { SidebarDrawer } from "@/components/navigation/sidebar-drawer";
import type { Item } from "@/lib/api/types";

/** Os arquivos das telas do Figma, para comparar a lista com o desenho. */
const ITEMS: Item[] = [
  file("Contrato de locação.pdf", "application/pdf", 2_516_582, "2026-10-12"),
  file("Férias na praia.jpg", "image/jpeg", 5_033_165, "2026-10-10"),
  file("Apresentação final.mp4", "video/mp4", 1_288_490_189, "2026-10-08"),
  file("Podcast episódio 12.mp3", "audio/mpeg", 40_370_176, "2026-10-02"),
  file("notas da reunião.txt", "text/plain", 4_096, "2026-09-28"),
];

function file(
  name: string,
  mimeType: string,
  sizeBytes: number,
  date: string,
): Item {
  return {
    id: name,
    type: "file",
    name,
    mimeType,
    sizeBytes,
    updatedAt: `${date}T15:00:00.000Z`,
  };
}

async function noop() {
  "use server";
}

async function loadMore(): Promise<LoadMoreResult> {
  "use server";
  return {
    ok: true,
    rows: [toFileRow(file("arquivo.zip", "application/zip", 300, "2026-09-01"))],
    nextCursor: null,
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="px-6 text-title text-ink">{title}</h2>
      <div className="border-y border-hairline">{children}</div>
    </section>
  );
}

/** As peças do Drive montadas, fora do fluxo: casca, lista com "Carregar mais" e estado vazio. */
export default function VitrineDrivePage() {
  return (
    <main className="flex flex-1 flex-col gap-12 bg-canvas py-6">
      <h1 className="px-6 text-display text-ink">Drive</h1>

      <Section title="app-bar e account-menu">
        <AppBar
          navigation={
            <SidebarDrawer>
              <Sidebar />
            </SidebarDrawer>
          }
          account={<AccountMenu email="ana@exemplo.com" logout={noop} />}
        />
      </Section>

      <Section title="sidebar">
        <div className="w-60 bg-surface p-3">
          <Sidebar />
        </div>
      </Section>

      <Section title="file-list e file-row">
        <div className="px-4 lg:px-6">
          <LoadMoreProvider initialCursor="vitrine" load={loadMore}>
            <FileList label="Meus arquivos">
              <div role="rowgroup">
                {ITEMS.map((item) => (
                  <FileRow key={item.id} row={toFileRow(item)} />
                ))}
              </div>
              <LoadedRows />
            </FileList>
            <LoadMoreButton />
          </LoadMoreProvider>
        </div>
      </Section>

      <Section title="empty-state">
        <div className="flex h-80">
          <EmptyState
            icon={<CloudUpload className="size-12" />}
            title="Nenhum arquivo ainda"
          >
            Arraste arquivos para cá ou clique em Enviar.
          </EmptyState>
        </div>
      </Section>
    </main>
  );
}

import { CloudUpload } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/files/empty-state";
import { FileTable } from "@/components/files/file-table";
import { toFileRow } from "@/components/files/format";
import { ROOT_FOLDER_LABEL } from "@/lib/drive";
import type { LoadMoreResult } from "@/components/files/load-more";
import { AccountMenu } from "@/components/navigation/account-menu";
import { AppBar } from "@/components/navigation/app-bar";
import { Sidebar } from "@/components/navigation/sidebar";
import { SidebarDrawer } from "@/components/navigation/sidebar-drawer";
import { UploadButton } from "@/components/uploads/upload-button";
import { UploadItem } from "@/components/uploads/upload-item";
import { UploadPanel } from "@/components/uploads/upload-panel";
import { UploadProvider } from "@/components/uploads/upload-provider";
import type {
  CompleteUploadResult,
  StartUploadResult,
  UploadEntry,
} from "@/components/uploads/types";
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

/** Na vitrine não há API: escolher um arquivo no "Enviar" mostra o painel com a falha de cota. */
async function startUploadWithoutQuota(): Promise<StartUploadResult> {
  "use server";
  return { ok: false, message: "Não há espaço na sua cota para este arquivo" };
}

async function completeUploadNoop(): Promise<CompleteUploadResult> {
  "use server";
  return { ok: true };
}

/** Um item do painel em cada estado que o envio de um único `PUT` tem. */
const UPLOAD_ENTRIES: UploadEntry[] = [
  {
    key: "enviando",
    name: "Apresentação final.mp4",
    mimeType: "video/mp4",
    status: "uploading",
    progress: 42,
  },
  {
    key: "concluido",
    name: "Férias na praia.jpg",
    mimeType: "image/jpeg",
    status: "done",
    progress: 100,
  },
  {
    key: "cota",
    name: "Fotos de 2025.zip",
    mimeType: "application/zip",
    status: "failed",
    progress: 0,
    message: "Não há espaço na sua cota para este arquivo",
  },
  {
    key: "grande",
    name: "Backup completo.iso",
    mimeType: "application/octet-stream",
    status: "failed",
    progress: 0,
    message: "O arquivo passa do limite de 5 GB",
  },
];

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
    <UploadProvider
      startUpload={startUploadWithoutQuota}
      completeUpload={completeUploadNoop}
    >
      <main className="flex flex-1 flex-col gap-12 bg-canvas py-6">
        <h1 className="px-6 text-display text-ink">Drive</h1>

        <Section title="app-bar e account-menu">
          <AppBar
            navigation={
              <SidebarDrawer>
                <Sidebar />
              </SidebarDrawer>
            }
            upload={<UploadButton />}
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
            <FileTable
              label={ROOT_FOLDER_LABEL}
              items={ITEMS}
              nextCursor="vitrine"
              load={loadMore}
            />
          </div>
        </Section>

        <Section title="upload-item">
          <ul className="w-90 rounded-lg border border-hairline bg-surface-raised">
            {UPLOAD_ENTRIES.map((entry) => (
              <UploadItem key={entry.key} entry={entry} onDismiss={noop} />
            ))}
          </ul>
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
      <UploadPanel />
    </UploadProvider>
  );
}

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
import { Dropzone } from "@/components/files/dropzone";
import { Banner } from "@/components/ui/banner";
import { FOLDER_DROPPED_MESSAGE } from "@/lib/uploads/panel";
import type {
  CancelUploadResult,
  CompleteUploadResult,
  StartUploadResult,
  UploadEntry,
} from "@/lib/uploads/types";
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

async function cancelUploadNoop(): Promise<CancelUploadResult> {
  "use server";
  return { ok: true };
}

/** Um item do painel em cada estado do envio. */
const UPLOAD_ENTRIES: UploadEntry[] = [
  {
    key: "enviando",
    name: "Apresentação final.mp4",
    mimeType: "video/mp4",
    sizeBytes: 1_288_490_189,
    status: "uploading",
    progress: 42,
  },
  {
    key: "pausado",
    name: "backup-2026.zip",
    mimeType: "application/zip",
    sizeBytes: 600_000_000,
    status: "paused",
    progress: 48,
  },
  {
    key: "fila",
    name: "Podcast episódio 12.mp3",
    mimeType: "audio/mpeg",
    sizeBytes: 40_370_176,
    status: "queued",
    progress: 0,
  },
  {
    key: "concluido",
    name: "Férias na praia.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 5_033_165,
    status: "done",
    progress: 100,
  },
  {
    key: "cota",
    name: "Fotos de 2025.zip",
    mimeType: "application/zip",
    sizeBytes: 900_000_000,
    status: "failed",
    progress: 0,
    message: "Não há espaço na sua cota para este arquivo",
    failure: "rejected",
  },
  {
    key: "rede",
    name: "Gravação da aula.mp4",
    mimeType: "video/mp4",
    sizeBytes: 300_000_000,
    status: "failed",
    progress: 64,
    message: "A conexão falhou durante o envio",
    failure: "connection",
  },
  {
    key: "grande",
    name: "Backup completo.iso",
    mimeType: "application/octet-stream",
    sizeBytes: 6_000_000_000,
    status: "failed",
    progress: 0,
    message: "O arquivo passa do limite de 5 GB",
    failure: "rejected",
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
      cancelUpload={cancelUploadNoop}
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
              <UploadItem
                key={entry.key}
                entry={entry}
                onPause={noop}
                onResume={noop}
                onCancel={noop}
                onRetry={noop}
                onDismiss={noop}
              />
            ))}
          </ul>
        </Section>

        <Section title="upload-panel: aviso de pasta solta">
          <div className="w-90 rounded-lg border border-hairline bg-surface-raised p-3">
            <Banner variant="warning" layout="narrow">
              {FOLDER_DROPPED_MESSAGE}
            </Banner>
          </div>
        </Section>

        <Section title="dropzone (arraste um arquivo sobre esta área)">
          <div className="flex h-80 px-4 py-4 lg:px-6">
            <Dropzone folderName={ROOT_FOLDER_LABEL} parentId="root">
              <div className="flex flex-1 items-center justify-center text-ink-muted">
                Arraste um arquivo sobre esta área para ver a zona de soltar.
              </div>
            </Dropzone>
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
      <UploadPanel />
    </UploadProvider>
  );
}

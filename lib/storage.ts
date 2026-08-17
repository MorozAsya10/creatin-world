// Файлы портфолио креаторов хранятся прямо на диске (не в S3/объектном
// хранилище) — этого достаточно для MVP. FILE_STORAGE_PATH переключает
// каталог, по умолчанию — ./uploads. Отдаются они через собственный роут
// app/api/files/[id]/route.ts, а не напрямую как статика, чтобы можно было
// потом добавить проверку прав доступа.
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

function storageRoot() {
  const configured = process.env.FILE_STORAGE_PATH || "uploads";
  if (path.isAbsolute(configured)) return configured;

  const clean = configured.replace(/^\.?\/*/, "");
  if (!clean || clean === "uploads") return path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads");

  return path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads", clean);
}

export async function savePortfolioUpload(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name).toLowerCase();
  const safeExt = ext && ext.length <= 12 ? ext : "";
  const storageKey = `${randomUUID()}${safeExt}`;
  const root = storageRoot();
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, storageKey), bytes);

  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: bytes.length,
    storageKey,
    url: `/api/files/${storageKey}`
  };
}

export async function readStorageFile(storageKey: string) {
  const root = storageRoot();
  // path.basename отрезает любые "../" в ключе — без этого запрос вида
  // storageKey="../../.env" мог бы читать произвольные файлы с диска.
  const cleanKey = path.basename(storageKey);
  return readFile(path.join(root, cleanKey));
}

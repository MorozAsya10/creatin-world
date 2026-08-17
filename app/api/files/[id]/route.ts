import { NextResponse } from "next/server";
import { fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { readStorageFile } from "@/lib/storage";

// Отдаёт файл портфолио по PortfolioFile.id или storageKey (оба варианта,
// т.к. url в БД хранит storageKey, а некоторые ссылки могут указывать на id).
// Без авторизации намеренно — портфолио открыто всем, кто видит профиль
// креатора; проверка прав была бы избыточна для публичных файлов.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const file = await prisma.portfolioFile.findFirst({
      where: {
        OR: [{ id }, { storageKey: id }]
      }
    });
    if (!file) throw new ApiError(404, "File not found");

    const bytes = await readStorageFile(file.storageKey);
    return new NextResponse(bytes, {
      headers: {
        "content-type": file.mimeType,
        "content-length": String(file.size),
        "content-disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`
      }
    });
  } catch (error) {
    return fail(error);
  }
}

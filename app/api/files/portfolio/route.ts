import { Role } from "@prisma/client";
import { ok, fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { savePortfolioUpload } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const user = await requireUser([Role.CREATOR, Role.ADMIN]);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "file is required");
    if (file.size === 0) throw new ApiError(400, "Файл пуст");
    if (file.size > 15 * 1024 * 1024) {
      throw new ApiError(413, "Максимальный размер файла — 15 МБ");
    }

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4"
    ];
    if (!allowedTypes.includes(file.type)) {
      throw new ApiError(415, "Поддерживаются PDF, JPG, PNG, WEBP и MP4");
    }

    // user.creatorProfile — не user.role === CREATOR: один аккаунт может
    // держать анкету креатора и карточку заказчика одновременно (см.
    // hasRole в lib/session.ts), поэтому наличие своего профиля важнее
    // "изначальной" роли.
    const creatorProfileId =
      user.creatorProfile?.id || String(formData.get("creatorProfileId") || "");

    if (!creatorProfileId) throw new ApiError(400, "creatorProfileId is required");

    const stored = await savePortfolioUpload(file);
    const portfolioFile = await prisma.portfolioFile.create({
      data: {
        creatorProfileId,
        ...stored
      }
    });

    return ok({ file: portfolioFile }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

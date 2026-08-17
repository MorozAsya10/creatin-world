import { Role } from "@prisma/client";

import { ApiError, fail, ok } from "@/lib/api";
import { upsertGeneratedCreators } from "@/lib/demo-creators";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Кнопка в админке "перегенерировать демо-креаторов" — точечный upsert
// (см. lib/demo-creators.ts), не трогает реальные заказы/анкеты. Специально
// закрыт в production через 404, чтобы не могли дёрнуть по прямому URL.
export async function POST() {
  try {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(404, "Not found");
    }

    await requireUser([Role.ADMIN]);
    return ok(await upsertGeneratedCreators(prisma));
  } catch (error) {
    return fail(error);
  }
}

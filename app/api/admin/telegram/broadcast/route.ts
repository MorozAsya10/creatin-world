import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { broadcastToAudience } from "@/lib/telegram-bot";

// Рассылка новостей всем пользователям в Telegram — только админ. audience
// сужает получателей до тех, у кого есть соответствующий профиль; сам факт
// "есть привязанный telegramId и не выключены уведомления" уже проверяется
// внутри broadcastTelegram (lib/telegram-bot.ts), здесь только выбор круга.
const broadcastSchema = z.object({
  text: z.string().trim().min(5, "Слишком короткий текст").max(4000),
  audience: z.enum(["all", "creators", "clients"]).default("all")
});

export async function POST(request: Request) {
  try {
    const admin = await requireUser([Role.ADMIN]);
    const body = broadcastSchema.parse(await request.json());

    const result = await broadcastToAudience(body.audience, body.text);

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "telegram.broadcast",
        entity: "User",
        payload: { audience: body.audience, sent: result.sent, failed: result.failed, text: body.text }
      }
    });

    return ok({ result }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

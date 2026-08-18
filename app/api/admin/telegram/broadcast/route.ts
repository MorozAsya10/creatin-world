import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { broadcastTelegram } from "@/lib/telegram-bot";

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

    const users = await prisma.user.findMany({
      where:
        body.audience === "creators"
          ? { creatorProfile: { isNot: null } }
          : body.audience === "clients"
            ? { clientProfile: { isNot: null } }
            : {},
      select: { id: true }
    });

    const result = await broadcastTelegram(
      users.map((item) => item.id),
      body.text
    );

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

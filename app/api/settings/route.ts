import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({
  email: z.string().email().or(z.literal("")),
  notificationPreference: z.enum(["telegram", "platform"])
});

// Общие настройки аккаунта (доступны и креатору, и заказчику) — email для
// уведомлений/документов и канал уведомлений. Telegram-логин и роль тут не
// меняются: это отдельная, более чувствительная зона (см. lib/telegram.ts).
export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const body = schema.parse(await request.json());
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: body.email || null,
        notificationPreference: body.notificationPreference
      },
      select: {
        id: true,
        email: true,
        notificationPreference: true
      }
    });

    return ok({ user: updated });
  } catch (error) {
    return fail(error);
  }
}

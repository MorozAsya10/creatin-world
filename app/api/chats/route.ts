import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { resolveViewRole } from "@/lib/dual-role";

const createChatSchema = z.object({
  applicationId: z.string().min(1)
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    // Один аккаунт может держать и анкету креатора, и карточку заказчика
    // (см. lib/dual-role.ts) — ?as=CREATOR|CLIENT говорит, какой из двух
    // наборов чатов сейчас нужен фронту (см. activeView в PlatformShell.tsx),
    // без параметра — как раньше, по основной роли аккаунта.
    const viewRole = resolveViewRole(user, request.nextUrl.searchParams.get("as"));
    if (viewRole === Role.CREATOR && !user.creatorProfile) return ok({ chats: [] });
    if (viewRole === Role.CLIENT && !user.clientProfile) return ok({ chats: [] });

    const where =
      viewRole === Role.CREATOR
        ? { creatorProfileId: user.creatorProfile!.id }
        : viewRole === Role.CLIENT
          ? { clientProfileId: user.clientProfile!.id }
          : {};

    const chats = await prisma.chat.findMany({
      where,
      include: {
        order: true,
        application: true,
        creatorProfile: { include: { user: true } },
        clientProfile: { include: { user: true } },
        messages: {
          include: { sender: true },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    return ok({ chats });
  } catch (error) {
    return fail(error);
  }
}

// Чаты в продукте — не свободная переписка, а всегда 1:1 с конкретным
// откликом (Application). POST открывает чат по отклику (только заказчик
// или админ — креатор не может написать первым) и переводит отклик в
// статус CHAT_OPEN; повторный вызов на уже открытый чат просто возвращает его.
export async function POST(request: Request) {
  try {
    const user = await requireUser([Role.CLIENT, Role.ADMIN]);
    const { applicationId } = createChatSchema.parse(await request.json());

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        order: true,
        creatorProfile: true,
        chat: true
      }
    });

    if (!application) throw new ApiError(404, "Application not found");
    if (user.clientProfile && user.clientProfile.id !== application.order.clientProfileId) {
      throw new ApiError(403, "Only the order owner can open this chat");
    }

    if (application.chat) return ok({ chat: application.chat });

    const chat = await prisma.chat.create({
      data: {
        orderId: application.orderId,
        applicationId: application.id,
        clientProfileId: application.order.clientProfileId,
        creatorProfileId: application.creatorProfileId
      },
      include: { order: true, application: true }
    });

    await prisma.application.update({
      where: { id: application.id },
      data: { status: "CHAT_OPEN" }
    });

    return ok({ chat }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

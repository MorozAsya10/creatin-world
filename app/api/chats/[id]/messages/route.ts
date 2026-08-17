import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4000)
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const chat = await prisma.chat.findUnique({ where: { id } });
    if (!chat) throw new ApiError(404, "Chat not found");

    // Только сам креатор/заказчик из этого чата или админ — иначе можно
    // было бы писать в чужие переговоры по id.
    const isParticipant =
      user.role === Role.ADMIN ||
      user.creatorProfile?.id === chat.creatorProfileId ||
      user.clientProfile?.id === chat.clientProfileId;

    if (!isParticipant) throw new ApiError(403, "Only chat participants can send messages");

    const body = messageSchema.parse(await request.json());
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          chatId: chat.id,
          senderId: user.id,
          body: body.body
        },
        include: { sender: true }
      }),
      prisma.chat.update({
        where: { id: chat.id },
        data: { updatedAt: new Date() }
      })
    ]);

    return ok({ message }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

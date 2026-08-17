import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const partners = await prisma.partner.findMany({
      where: { active: true },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }]
    });

    return ok({ partners });
  } catch (error) {
    return fail(error);
  }
}

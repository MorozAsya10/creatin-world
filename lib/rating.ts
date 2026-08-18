// Индекс креатора (CreatorProfile.score, 0..100) — обсуждали на планировании:
// не звёздная оценка, а составной индекс из нескольких сигналов. Веса ниже —
// наше собственное решение (в записи встречи точные проценты не были
// зафиксированы, только сами компоненты), при желании легко поменять в одном
// месте:
//   - 30% — заполненность профиля (bio, экспертиза, портфолио, кейсы, фото,
//     город): чем полнее анкета, тем выше стартовый индекс, даже без единого
//     заказа.
//   - 30% — активность на платформе: сколько заказов/вакансий креатор уже
//     брал (считаем по количеству откликов — заявка создаётся только на
//     опубликованный заказ, см. POST /api/orders/[id]/applications). 5+
//     откликов — уже полный балл по этой части.
//   - 40% — доля заказчиков, готовых рекомендовать (Application.clientRecommended,
//     см. её комментарий в schema.prisma). Пока отзывов нет — не 0%, а
//     нейтральные 70%: отсутствие истории не должно топить профиль (этот
//     момент отдельно поднимали на встрече — "нет отзывов не значит, что
//     специалист плохой").
// Индекс не считается на лету при каждом чтении, а пересчитывается и
// сохраняется в CreatorProfile.score в конкретные моменты (см. вызовы
// refreshCreatorScore): после сохранения анкеты, после отклика на заказ и
// после того, как заказчик поставил рекомендацию/не рекомендацию.
import { prisma } from "@/lib/prisma";

const WEIGHT_COMPLETENESS = 0.3;
const WEIGHT_ACTIVITY = 0.3;
const WEIGHT_RECOMMENDATION = 0.4;
const NEUTRAL_RECOMMENDATION_SCORE = 70;
const FULL_ACTIVITY_RESPONSES = 5;

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function computeCreatorScore(creatorProfileId: string): Promise<number> {
  const profile = await prisma.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    include: { files: true }
  });
  if (!profile) return 0;

  const completenessChecks = [
    Boolean(profile.bio?.trim()),
    profile.expertise.length > 0,
    Boolean(profile.portfolioUrl?.trim()) || profile.files.length > 0,
    Boolean(profile.cases?.trim()),
    Boolean(profile.photoUrl?.trim()),
    Boolean(profile.city?.trim())
  ];
  const completeness = (completenessChecks.filter(Boolean).length / completenessChecks.length) * 100;

  const [responsesCount, recommendationRows] = await Promise.all([
    prisma.application.count({ where: { creatorProfileId } }),
    prisma.application.findMany({
      where: { creatorProfileId, clientRecommended: { not: null } },
      select: { clientRecommended: true }
    })
  ]);

  const activity = Math.min(responsesCount / FULL_ACTIVITY_RESPONSES, 1) * 100;

  const reviewed = recommendationRows.length;
  const recommended = recommendationRows.filter((row) => row.clientRecommended).length;
  const recommendationScore = reviewed === 0 ? NEUTRAL_RECOMMENDATION_SCORE : (recommended / reviewed) * 100;

  const finalScore =
    completeness * WEIGHT_COMPLETENESS +
    activity * WEIGHT_ACTIVITY +
    recommendationScore * WEIGHT_RECOMMENDATION;

  return clampPercent(finalScore);
}

// Пересчитывает и сохраняет индекс — вызывать после любого события, которое
// на него влияет (см. список в комментарии наверху файла). Не бросает
// исключение при отсутствующем профиле — вызывающий код не должен падать
// из-за пересчёта рейтинга.
export async function refreshCreatorScore(creatorProfileId: string) {
  const score = await computeCreatorScore(creatorProfileId);
  await prisma.creatorProfile.update({
    where: { id: creatorProfileId },
    data: { score }
  }).catch(() => null);
  return score;
}

// AI-подбор топ-3 креаторов под конкретный заказ.
//
// Пайплайн (см. matchCreatorsForOrder внизу файла):
//   1. Забираем всех одобренных креаторов как кандидатов.
//   2. Локально ранжируем их (rankCandidates) и берём топ-30 — это шорт-лист,
//      который реально уходит во внешний AI, чтобы не раздувать промпт.
//   3. Пробуем внешний провайдер (OpenAI, либо кастомный AI_API_ENDPOINT).
//      Если он ответил — подмешиваем локальный fallback для недостающих мест
//      (внешний AI мог вернуть меньше 3 кандидатов).
//   4. Если внешний AI недоступен/упал — используем чисто локальный fallback.
//      Флаг feature-flag `ai.external_required` решает, кидать ли ошибку
//      или тихо откатываться на локальный подбор (см. getFeatureFlags).
//   5. Каждый вызов логируется в AiLog (успех/ошибка), а итоговые 3 матча
//      перезаписывают AiMatch для заказа.
//
// Важно: локальный ранжировщик (rankCandidates) — не заглушка "на потом",
// а полноценный резервный алгоритм, который обязан работать самостоятельно.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { getFeatureFlags } from "@/lib/config";

type Candidate = {
  id: string;
  name: string;
  category: string;
  primaryRole: string;
  level: string;
  experienceYears: number;
  expertise: string[];
  bio: string;
  minBudget: number;
  score: number;
};

type AiMatchResult = {
  creatorProfileId: string;
  score: number;
  rationale: string;
};

type MatchOrder = {
  category: string;
  title: string;
  description: string;
  requirements: string;
  budget: string;
};

const aiMatchResponseSchema = z.object({
  matches: z
    .array(
      z.object({
        creatorProfileId: z.string().min(1),
        score: z.number().min(1).max(99),
        rationale: z.string().min(1).max(500)
      })
    )
    .max(3)
});

function clampScore(score: number) {
  return Math.max(1, Math.min(99, Math.round(score)));
}

function searchableWords(value: string) {
  const shortTerms = new Set(["ai", "ui", "ux", "3d", "2d", "smm", "llm"]);

  return value
    .toLowerCase()
    .replaceAll("ё", "е")
    .split(/[^a-zа-яё0-9]+/i)
    .filter((word) => word.length >= 4 || shortTerms.has(word));
}

function experienceLabel(years: number) {
  const lastTwo = years % 100;
  const last = years % 10;
  const unit = lastTwo >= 11 && lastTwo <= 14 ? "лет" : last === 1 ? "год" : last >= 2 && last <= 4 ? "года" : "лет";
  return `${years} ${unit} опыта`;
}

function categoryAffinity(candidateCategory: string, orderCategory: string) {
  if (candidateCategory === orderCategory) return 1;

  const relatedCategories: Record<string, string[]> = {
    Дизайн: ["Креатив", "AI"],
    Видео: ["Креатив", "AI"],
    Тексты: ["Маркетинг", "Креатив"],
    Маркетинг: ["Тексты", "Креатив"],
    Креатив: ["Дизайн", "Видео", "Маркетинг"],
    AI: ["Видео", "Дизайн", "Креатив"],
    Менеджмент: ["Креатив", "Маркетинг"]
  };

  return relatedCategories[orderCategory]?.includes(candidateCategory) ? 0.38 : 0;
}

function inferredOrderCategories(text: string) {
  const categoryPatterns: Array<[string, RegExp]> = [
    ["Дизайн", /дизайн|айдентик|брендинг|логотип|типограф|упаковк|figma|\bui\b|\bux\b/i],
    ["Видео", /видео|ролик|монтаж|reels|shorts|съем|съём|клип|motion|\b3d\b/i],
    ["Тексты", /текст|редактур|стать|колонк|копирайт|сценар|лонгрид|tone of voice/i],
    ["Маркетинг", /маркетинг|продвиж|контент-план|аудитори|performance|воронк|таргет|\bsmm\b/i],
    ["Креатив", /креатив|концепц|кампан|спецпроект|арт-дирек|иде[яи]/i],
    ["AI", /нейросет|генератив|midjourney|runway|kling|comfy|\bai\b|\bии\b/i],
    ["Менеджмент", /продюсер|менедж|управлен|координац|команд|смет|delivery/i]
  ];

  return new Set(categoryPatterns.filter(([, pattern]) => pattern.test(text)).map(([category]) => category));
}

function orderBudgetCeiling(budget: string) {
  const values = budget
    .replace(/\s+/g, "")
    .match(/\d+(?:[.,]\d+)?/g)
    ?.map((value) => Number(value.replace(",", ".")))
    .filter(Number.isFinite);

  if (!values?.length) return null;

  const multiplier = /тыс|k\b/i.test(budget) || Math.max(...values) < 1000 ? 1000 : 1;
  return Math.max(...values) * multiplier;
}

// Локальный скоринг без обращения к внешнему AI: складывает несколько
// эвристических "буст"-компонентов (категория, экспертиза, роль, бюджет,
// опыт, внутренний рейтинг профиля) в один rawScore и сортирует кандидатов
// по убыванию. Используется и как шорт-лист перед внешним AI, и как
// самостоятельный fallback, если внешний AI недоступен.
function rankCandidates(order: MatchOrder, candidates: Candidate[]) {
  const text = `${order.title} ${order.description} ${order.requirements}`.toLowerCase();
  const textWords = new Set(searchableWords(text));
  const budgetCeiling = orderBudgetCeiling(order.budget);
  const inferredCategories = inferredOrderCategories(text);

  return candidates
    .map((candidate) => {
      const explicitAffinity = categoryAffinity(candidate.category, order.category);
      const inferredAffinity = inferredCategories.has(candidate.category)
        ? 1
        : Math.max(...Array.from(inferredCategories).map((category) => categoryAffinity(candidate.category, category)), 0);
      const matchedExpertise = candidate.expertise.filter((tag) => {
        const normalizedTag = tag.toLowerCase();
        return text.includes(normalizedTag) || searchableWords(normalizedTag).some((word) => textWords.has(word));
      });
      const matchedRoleTerms = searchableWords(candidate.primaryRole).filter((word) => textWords.has(word));
      const matchedProfileTerms = searchableWords(candidate.bio).filter((word) => textWords.has(word));
      const budgetFits = budgetCeiling === null || candidate.minBudget <= budgetCeiling;
      const budgetClose = budgetCeiling !== null && candidate.minBudget <= budgetCeiling * 1.2;
      const categoryBoost = Math.min(38, explicitAffinity * 22 + inferredAffinity * 24);
      const expertiseBoost = Math.min(matchedExpertise.length * 9, 27);
      const roleBoost = Math.min(matchedRoleTerms.length * 5.5, 11);
      const profileBoost = Math.min(new Set(matchedProfileTerms).size * 1.2, 6);
      const budgetBoost = budgetCeiling === null ? 3 : budgetFits ? 10 : budgetClose ? 4 : -8;
      const experienceBoost = Math.min(candidate.experienceYears, 10) * 0.65;
      const ratingBoost = Math.max(0, Math.min(10, (candidate.score - 70) * 0.36));
      const rawScore = 12 + categoryBoost + expertiseBoost + roleBoost + profileBoost + budgetBoost + experienceBoost + ratingBoost;
      const signals = [
        explicitAffinity === 1 && inferredAffinity === 1
          ? `категория и содержание задачи: «${candidate.category}»`
          : inferredAffinity === 1
            ? `содержание задачи соответствует категории «${candidate.category}»`
            : explicitAffinity === 1
              ? `указанная категория «${candidate.category}»`
              : explicitAffinity > 0 || inferredAffinity > 0
                ? `смежная категория «${candidate.category}»`
                : "",
        matchedExpertise.length ? `навыки: ${matchedExpertise.slice(0, 3).join(", ")}` : "",
        matchedRoleTerms.length ? `роль ${candidate.primaryRole}` : "",
        experienceLabel(candidate.experienceYears),
        budgetCeiling !== null ? (budgetFits ? "бюджет подходит" : budgetClose ? "бюджет близок" : "бюджет выше указанного") : ""
      ].filter(Boolean);

      return {
        candidate,
        creatorProfileId: candidate.id,
        rawScore,
        profileScore: candidate.score,
        rationale: `${signals.join("; ")}.`
      };
    })
    .sort((a, b) => b.rawScore - a.rawScore || b.profileScore - a.profileScore || a.creatorProfileId.localeCompare(b.creatorProfileId));
}

function fallbackMatch(order: MatchOrder, candidates: Candidate[]) {
  const ranked = rankCandidates(order, candidates).slice(0, 3);

  return ranked.map((match, index) => ({
    creatorProfileId: match.creatorProfileId,
    rationale: match.rationale,
    score: clampScore(Math.min(97, match.rawScore) - index)
  }));
}

function shortlistCandidates(order: MatchOrder, candidates: Candidate[]) {
  return rankCandidates(order, candidates)
    .slice(0, 30)
    .map((match) => match.candidate);
}

// Внешний AI мог придумать несуществующий id, вернуть дубликаты или пустой
// rationale — здесь всё это отфильтровывается, прежде чем результат уйдёт
// в БД или пользователю. Никогда не доверяем ответу внешнего провайдера напрямую.
function sanitizeMatches(matches: AiMatchResult[], candidates: Candidate[]) {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const seenIds = new Set<string>();
  const sanitized: AiMatchResult[] = [];

  for (const match of matches) {
    const rationale = match.rationale.trim();

    if (!candidateIds.has(match.creatorProfileId) || seenIds.has(match.creatorProfileId) || !rationale) {
      continue;
    }

    seenIds.add(match.creatorProfileId);
    sanitized.push({
      creatorProfileId: match.creatorProfileId,
      score: clampScore(match.score),
      rationale: rationale.slice(0, 500)
    });
  }

  return sanitized.slice(0, 3);
}

function externalProviderName() {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return `openai:${process.env.OPENAI_MODEL || "gpt-5.6"}`;
  }

  return process.env.AI_API_ENDPOINT || "external-ai";
}

async function callOpenAi(order: unknown, candidates: Candidate[]): Promise<AiMatchResult[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return [];

  const openai = new OpenAI({ apiKey, maxRetries: 1, timeout: 20_000 });
  const response = await openai.responses.parse({
    model: process.env.OPENAI_MODEL || "gpt-5.6",
    instructions: [
      "Ты отвечаешь за подбор креаторов для CREATIN.WORLD.",
      "Выбери до трех наиболее подходящих кандидатов для конкретного заказа.",
      "Сравни категорию, основную роль, уровень, опыт, экспертизу, описание профиля, минимальный бюджет, источник заказа и внутренний рейтинг.",
      "Не придумывай факты и используй только creatorProfileId из переданного списка candidates.",
      "Оценка должна быть от 1 до 99, а rationale — кратким и конкретным объяснением на русском языке."
    ].join(" "),
    input: JSON.stringify({ order, candidates }),
    text: {
      format: zodTextFormat(aiMatchResponseSchema, "creator_matches")
    }
  });

  if (!response.output_parsed) return [];
  return sanitizeMatches(response.output_parsed.matches, candidates);
}

async function callCustomExternalAi(order: unknown, candidates: Candidate[]): Promise<AiMatchResult[]> {
  const endpoint = process.env.AI_API_ENDPOINT;
  if (!endpoint) return [];

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.AI_API_KEY ? { authorization: `Bearer ${process.env.AI_API_KEY}` } : {})
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model: process.env.AI_API_MODEL || "creatin-top3",
      task: "rank_top_3_creators_for_order",
      order,
      candidates
    })
  });

  if (!response.ok) {
    throw new Error(`AI API failed with ${response.status}`);
  }

  const parsed = aiMatchResponseSchema.safeParse(await response.json());
  return parsed.success ? sanitizeMatches(parsed.data.matches, candidates) : [];
}

async function callExternalAi(order: unknown, candidates: Candidate[]): Promise<AiMatchResult[]> {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return callOpenAi(order, candidates);
  }

  return callCustomExternalAi(order, candidates);
}

// Точка входа, вызывается из POST /api/ai/match. Полностью пересоздаёт
// AiMatch-записи заказа (deleteMany + create), поэтому безопасно вызывать
// повторно — старые рекомендации просто заменяются новыми.
export async function matchCreatorsForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      aiMatches: true
    }
  });

  if (!order) throw new ApiError(404, "Order not found");

  const creators = await prisma.creatorProfile.findMany({
    where: {
      OR: [{ isApproved: true }, { status: "APPROVED" }]
    },
    include: { user: true }
  });

  const candidates: Candidate[] = creators.map((creator) => ({
    id: creator.id,
    name: `${creator.firstName} ${creator.lastName}`,
    category: creator.category,
    primaryRole: creator.primaryRole,
    level: creator.level,
    experienceYears: creator.experienceYears,
    expertise: creator.expertise,
    bio: creator.bio,
    minBudget: creator.minBudget,
    score: creator.score
  }));

  const flags = await getFeatureFlags();
  const requestPayload = {
    id: order.id,
    publicId: order.publicId,
    title: order.title,
    category: order.category,
    description: order.description,
    requirements: order.requirements,
    budget: order.budget,
    deadline: order.deadline,
    initiator: order.initiator
  };
  const shortlistedCandidates = shortlistCandidates(requestPayload, candidates);

  let provider = "local-fallback";
  let responsePayload: unknown = null;
  let matches: AiMatchResult[] = [];

  try {
    matches = await callExternalAi(requestPayload, shortlistedCandidates);
    if (matches.length > 0) {
      const fallbackMatches = fallbackMatch(requestPayload, candidates);
      const selectedIds = new Set(matches.map((match) => match.creatorProfileId));
      matches = [
        ...matches,
        ...fallbackMatches.filter((match) => !selectedIds.has(match.creatorProfileId))
      ].slice(0, 3);
      provider = externalProviderName();
      responsePayload = { matches };
    }
  } catch (error) {
    await prisma.aiLog.create({
      data: {
        orderId: order.id,
        provider: externalProviderName(),
        status: "failed",
        request: { order: requestPayload, candidates: shortlistedCandidates },
        error: error instanceof Error ? error.message : "Unknown AI error"
      }
    });

    if (flags.aiExternalRequired) throw new ApiError(502, "External AI API is unavailable");
  }

  if (matches.length === 0) {
    matches = fallbackMatch(requestPayload, candidates);
    responsePayload = { matches };
  }

  await prisma.aiLog.create({
    data: {
      orderId: order.id,
      provider,
      status: "succeeded",
      request: { order: requestPayload, candidates: shortlistedCandidates },
      response: responsePayload as object
    }
  });

  await prisma.aiMatch.deleteMany({ where: { orderId: order.id } });

  const persisted = await Promise.all(
    matches.slice(0, 3).map((match, index) =>
      prisma.aiMatch.create({
        data: {
          orderId: order.id,
          creatorProfileId: match.creatorProfileId,
          rank: index + 1,
          score: clampScore(match.score),
          rationale: match.rationale,
          provider,
          rawResponse: responsePayload as object
        },
        include: {
          creatorProfile: {
            include: { user: true }
          }
        }
      })
    )
  );

  return persisted;
}

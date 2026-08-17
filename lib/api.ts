// Общие хелперы для всех app/api/**/route.ts.
// Паттерн у каждого роута один и тот же:
//   try { ...; return ok(data); } catch (error) { return fail(error); }
// throw new ApiError(status, message) внутри роута/lib-функции — это
// единственный способ вернуть контролируемый HTTP-статус и текст ошибки
// клиенту; всё остальное (в т.ч. ошибки Prisma) превращается в generic 500,
// чтобы не утекали детали БД наружу.
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Единая точка обработки ошибок для всех API-роутов: ApiError -> нужный
// статус, ZodError -> 400 с разбивкой по полям (fieldErrors — то, что
// формы на фронте показывают под инпутами), всё остальное -> 500 + лог.
export function fail(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Проверьте заполнение обязательных полей",
        fields: error.flatten().fieldErrors
      },
      { status: 400 }
    );
  }

  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

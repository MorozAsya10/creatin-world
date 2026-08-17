// Отдельный от seed.ts скрипт: только upsert сгенерированных креаторов, без
// удаления существующих данных. Дублирует то, что делает
// app/api/admin/demo-creators/route.ts, но как CLI-команда (см. package.json).
import { PrismaClient } from "@prisma/client";
import { upsertGeneratedCreators } from "../lib/demo-creators";

const prisma = new PrismaClient();

async function main() {
  const result = await upsertGeneratedCreators(prisma);
  console.log(`Upserted ${result.upserted} demo creators. Total creators: ${result.total}.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

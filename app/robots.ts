import type { MetadataRoute } from "next";

// См. пункт "нет robots.txt" в creatin_world_audit_1.md. /platform и /api —
// приватные/служебные разделы, индексировать их незачем. Секретный путь
// админки (см. lib/admin-route.ts) сюда намеренно НЕ добавляется: перечислить
// его в disallow — значит написать его открытым текстом в публичном
// robots.txt, что противоречит самой идее скрытого пути.
const APP_URL = process.env.APP_URL || "https://creatin.world";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/platform", "/api/"]
    },
    sitemap: `${APP_URL}/sitemap.xml`
  };
}

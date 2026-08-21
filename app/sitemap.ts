import type { MetadataRoute } from "next";

// См. пункт "нет sitemap.xml" в creatin_world_audit_1.md. Только публичные,
// действительно проиндексированные страницы — /platform и админка сюда не
// входят (см. app/robots.ts).
const APP_URL = process.env.APP_URL || "https://creatin.world";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["/", "/creators", "/jobs", "/partners", "/privacy", "/login"];

  return routes.map((route) => ({
    url: `${APP_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.6
  }));
}

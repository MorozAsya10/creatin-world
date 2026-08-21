// Базовые security-заголовки (см. пункт "нет security-заголовков" в
// creatin_world_audit_1.md). CSP собрана по факту используемых внешних
// источников на сайте:
//   - https://telegram.org — сам скрипт виджета входа (TelegramLogin.tsx);
//   - https://oauth.telegram.org — iframe самого виджета входа;
//   - 'unsafe-inline' на script-src нужен для инлайн-скрипта темы в
//     app/layout.tsx (themeScript) — без него ломается анти-flash тема при
//     первой отрисовке; переход на nonce — отдельная задача;
//   - img-src на https: широкий, т.к. фото креаторов/файлы могут прийти с
//     разных внешних адресов (нет фиксированного CDN/бакета).
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://telegram.org",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src https://oauth.telegram.org",
      "frame-ancestors 'self'"
    ].join("; ")
  }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;

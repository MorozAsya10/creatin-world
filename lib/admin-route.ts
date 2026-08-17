// Публичный путь к админке не должен быть угадываемым словом вроде /admin.
// Настоящая страница по-прежнему живёт в app/admin (внутренний путь),
// но снаружи доступна только по этому секретному сегменту — см. proxy.ts.
// Значение можно сменить в любой момент через переменную окружения
// NEXT_PUBLIC_ADMIN_PANEL_PATH (без слэшей), не трогая код.
const rawPath = process.env.NEXT_PUBLIC_ADMIN_PANEL_PATH || "cw-console-74x2";

export const ADMIN_PANEL_PATH = rawPath.replace(/^\/+|\/+$/g, "");
export const ADMIN_PANEL_ROUTE = `/${ADMIN_PANEL_PATH}`;

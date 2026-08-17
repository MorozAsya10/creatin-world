import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_PANEL_PATH } from "@/lib/admin-route";

// Прячем админку: настоящий роут /admin недоступен напрямую (уходит в 404),
// а снаружи она открывается только по секретному пути из ADMIN_PANEL_PATH.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return NextResponse.rewrite(new URL(`/__hidden__${pathname}`, request.url));
  }

  const secretRoot = `/${ADMIN_PANEL_PATH}`;
  if (pathname === secretRoot || pathname.startsWith(`${secretRoot}/`)) {
    const rest = pathname.slice(secretRoot.length);
    return NextResponse.rewrite(new URL(`/admin${rest}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};

import { NextResponse, type NextRequest } from "next/server";

const allowedHosts = new Set(["127.0.0.1:3000", "localhost:3000"]);
const allowedOrigins = new Set(["http://127.0.0.1:3000", "http://localhost:3000"]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLocaleLowerCase() ?? "";
  if (!allowedHosts.has(host)) {
    return new NextResponse("Acesso permitido apenas pelo computador local.", { status: 403 });
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (!origin || !allowedOrigins.has(origin.toLocaleLowerCase())) {
      return new NextResponse("Origem não autorizada.", { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

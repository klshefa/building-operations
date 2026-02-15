import { NextResponse, type NextRequest } from 'next/server'

// Passthrough middleware - uses client-side auth only
export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Skip static files and API routes
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

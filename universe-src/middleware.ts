import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  // Hard-404 legacy 3D Viewer URLs (avoid 308 redirect due to trailingSlash=true).
  const pathname = request.nextUrl.pathname
  if (pathname === '/app/viewer' || pathname === '/app/viewer/') {
    return new NextResponse('Not Found', { status: 404 })
  }

  // Логируем ВСЕ POST запросы к /api/datalab для диагностики
  if (request.method === 'POST' && request.nextUrl.pathname.startsWith('/api/datalab/')) {
    const contentLength = request.headers.get('content-length')
    console.log(`[Middleware] ========== POST ${request.nextUrl.pathname} ЗАПРОС ПОЛУЧЕН ==========`)
    console.log('[Middleware] Время:', new Date().toISOString())
    console.log('[Middleware] URL:', request.url)
    console.log('[Middleware] Content-Length:', contentLength, 'байт', contentLength ? `(${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB)` : '')
    console.log('[Middleware] Content-Type:', request.headers.get('content-type'))
    console.log('[Middleware] User-Agent:', request.headers.get('user-agent'))
  }
  
  // Логируем все POST запросы к /api/datalab/upload для диагностики
  if (request.method === 'POST' && request.nextUrl.pathname.includes('/api/datalab/upload')) {
    const contentLength = request.headers.get('content-length')
    console.log('[Middleware] ========== POST /api/datalab/upload ЗАПРОС ПОЛУЧЕН ==========')
    console.log('[Middleware] Время:', new Date().toISOString())
    console.log('[Middleware] URL:', request.url)
    console.log('[Middleware] Content-Length:', contentLength, 'байт', contentLength ? `(${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB)` : '')
    console.log('[Middleware] Content-Type:', request.headers.get('content-type'))
  }
  
  // КРИТИЧНО: Обрабатываем редирект 308 для DELETE запросов к API
  // Next.js с trailingSlash: true делает редирект 308, который браузеры не обрабатывают для DELETE
  // Поэтому перехватываем DELETE запросы к API и убираем trailing slash
  if (
    request.method === 'DELETE' &&
    request.nextUrl.pathname.startsWith('/api/datalab/') &&
    request.nextUrl.pathname.endsWith('/') &&
    request.nextUrl.pathname !== '/api/datalab/'
  ) {
    // Убираем trailing slash из pathname
    const pathWithoutSlash = request.nextUrl.pathname.replace(/\/$/, '')
    const newUrl = new URL(pathWithoutSlash + request.nextUrl.search, request.url)
    
    console.log('[Middleware] DELETE запрос: убран trailing slash', {
      originalPath: request.nextUrl.pathname,
      newPath: pathWithoutSlash,
    })
    
    // Перенаправляем на URL без trailing slash (внутренний rewrite, не редирект)
    return NextResponse.rewrite(newUrl)
  }

  const response = NextResponse.next()
  
  // Отключаем кэширование для RSC запросов (запросы с параметром ?_rsc= или ?rsc=)
  if (request.nextUrl.searchParams.has('_rsc') || request.nextUrl.searchParams.has('rsc')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    response.headers.set('x-nextjs-cache', 'SKIP')
  }

  return response
}

export const config = {
  matcher: [
    '/api/datalab/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}




﻿import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  // Р›РѕРіРёСЂСѓРµРј Р’РЎР• POST Р·Р°РїСЂРѕСЃС‹ Рє /api/datalab РґР»СЏ РґРёР°РіРЅРѕСЃС‚РёРєРё
  if (request.method === 'POST' && request.nextUrl.pathname.startsWith('/api/datalab/')) {
    const contentLength = request.headers.get('content-length')
    console.log(`[Middleware] ========== POST ${request.nextUrl.pathname} Р—РђРџР РћРЎ РџРћР›РЈР§Р•Рќ ==========`)
    console.log('[Middleware] Р’СЂРµРјСЏ:', new Date().toISOString())
    console.log('[Middleware] URL:', request.url)
    console.log('[Middleware] Content-Length:', contentLength, 'Р±Р°Р№С‚', contentLength ? `(${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB)` : '')
    console.log('[Middleware] Content-Type:', request.headers.get('content-type'))
    console.log('[Middleware] User-Agent:', request.headers.get('user-agent'))
  }
  
  // Р›РѕРіРёСЂСѓРµРј РІСЃРµ POST Р·Р°РїСЂРѕСЃС‹ Рє /api/datalab/upload РґР»СЏ РґРёР°РіРЅРѕСЃС‚РёРєРё
  if (request.method === 'POST' && request.nextUrl.pathname.includes('/api/datalab/upload')) {
    const contentLength = request.headers.get('content-length')
    console.log('[Middleware] ========== POST /api/datalab/upload Р—РђРџР РћРЎ РџРћР›РЈР§Р•Рќ ==========')
    console.log('[Middleware] Р’СЂРµРјСЏ:', new Date().toISOString())
    console.log('[Middleware] URL:', request.url)
    console.log('[Middleware] Content-Length:', contentLength, 'Р±Р°Р№С‚', contentLength ? `(${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB)` : '')
    console.log('[Middleware] Content-Type:', request.headers.get('content-type'))
  }
  
  // РљР РРўРР§РќРћ: РћР±СЂР°Р±Р°С‚С‹РІР°РµРј СЂРµРґРёСЂРµРєС‚ 308 РґР»СЏ DELETE Р·Р°РїСЂРѕСЃРѕРІ Рє API
  // Next.js СЃ trailingSlash: true РґРµР»Р°РµС‚ СЂРµРґРёСЂРµРєС‚ 308, РєРѕС‚РѕСЂС‹Р№ Р±СЂР°СѓР·РµСЂС‹ РЅРµ РѕР±СЂР°Р±Р°С‚С‹РІР°СЋС‚ РґР»СЏ DELETE
  // РџРѕСЌС‚РѕРјСѓ РїРµСЂРµС…РІР°С‚С‹РІР°РµРј DELETE Р·Р°РїСЂРѕСЃС‹ Рє API Рё СѓР±РёСЂР°РµРј trailing slash
  if (
    request.method === 'DELETE' &&
    request.nextUrl.pathname.startsWith('/api/datalab/') &&
    request.nextUrl.pathname.endsWith('/') &&
    request.nextUrl.pathname !== '/api/datalab/'
  ) {
    // РЈР±РёСЂР°РµРј trailing slash РёР· pathname
    const pathWithoutSlash = request.nextUrl.pathname.replace(/\/$/, '')
    const newUrl = new URL(pathWithoutSlash + request.nextUrl.search, request.url)
    
    console.log('[Middleware] DELETE Р·Р°РїСЂРѕСЃ: СѓР±СЂР°РЅ trailing slash', {
      originalPath: request.nextUrl.pathname,
      newPath: pathWithoutSlash,
    })
    
    // РџРµСЂРµРЅР°РїСЂР°РІР»СЏРµРј РЅР° URL Р±РµР· trailing slash (РІРЅСѓС‚СЂРµРЅРЅРёР№ rewrite, РЅРµ СЂРµРґРёСЂРµРєС‚)
    return NextResponse.rewrite(newUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/datalab/:path*',
}




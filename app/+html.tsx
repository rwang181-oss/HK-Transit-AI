export default function Root({ children }: { children: any }) {
  return (
    <html lang="zh-HK">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="preconnect" href="https://a.basemaps.cartocdn.com" />
        <link rel="preconnect" href="https://b.basemaps.cartocdn.com" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin="anonymous"
        />
        <style dangerouslySetInnerHTML={{ __html: `
          :root { color-scheme: light; background: #F4F6F8; }
          html, body, #root { width: 100%; min-height: 100%; margin: 0; }
          html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
          body { overflow-x: hidden; overscroll-behavior-y: none; background: #F4F6F8; }
          * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
          input, button, textarea, select { font: inherit; }
          .leaflet-container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          .leaflet-tile { image-rendering: auto; }
          @supports (padding: max(0px)) {
            body { padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }
          }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

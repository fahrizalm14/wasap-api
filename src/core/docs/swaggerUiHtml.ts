const SWAGGER_UI_VERSION = '5.17.14';

const SWAGGER_UI_DIST_BASE = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;

export function renderSwaggerUiHtml(specRelativePath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Wasap API – Swagger UI</title>
    <link rel="stylesheet" href="${SWAGGER_UI_DIST_BASE}/swagger-ui.css" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; }
      #swagger-ui { height: 100%; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI_DIST_BASE}/swagger-ui-bundle.js" crossorigin="anonymous"></script>
    <script src="${SWAGGER_UI_DIST_BASE}/swagger-ui-standalone-preset.js" crossorigin="anonymous"></script>
    <script>
      window.addEventListener('load', () => {
        window.SwaggerUIBundle({
          url: '${specRelativePath}',
          dom_id: '#swagger-ui',
          presets: [window.SwaggerUIBundle.presets.apis, window.SwaggerUIStandalonePreset],
          layout: 'BaseLayout',
        });
      });
    </script>
  </body>
</html>`;
}

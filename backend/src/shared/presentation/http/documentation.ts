export function documentationResponse(): Response {
  return new Response(`<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoices App API</title><link rel="stylesheet" href="/docs-assets/swagger-ui.css">
</head><body><div id="swagger-ui"></div><script src="/docs-assets/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:'/api/openapi',dom_id:'#swagger-ui',validatorUrl:null,persistAuthorization:false});</script>
</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

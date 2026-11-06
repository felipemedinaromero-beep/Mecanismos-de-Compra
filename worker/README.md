# Worker del asistente IA

Este Worker atiende `POST /api/assistant` para el asistente lateral del panel.

- Usa Claude Sonnet para consultas complejas cuando existe `ANTHROPIC_API_KEY`.
- Usa Workers AI como respaldo de menor costo mediante el binding `AI`.
- No contiene credenciales ni datos del panel.
- El secreto `ANTHROPIC_API_KEY` debe existir únicamente en Cloudflare Workers Secrets.

## Configuración

El binding `AI` se configura en Cloudflare. Para una instalación desde Wrangler, el secreto se agrega sin escribirlo en Git:

```bash
wrangler secret put ANTHROPIC_API_KEY
```

No se debe agregar la clave a archivos del repositorio, `.env` versionado ni mensajes.

from pathlib import Path

api = Path('server/api.ts')
text = api.read_text()

old_import = "} from './r2.js';\n\nexport const apiRouter = express.Router();"
new_import = "} from './r2.js';\nimport { mediaCdnStatus, publicMediaCdnUrl } from './mediaCdn.js';\n\nexport const apiRouter = express.Router();"
if old_import not in text:
    raise SystemExit('r2 import anchor not found')
text = text.replace(old_import, new_import, 1)

old_status = "apiRouter.get('/storage-status', async (_req: Request, res: Response) => {\n  const result = await checkStorageConnection();\n  return res.status(result.connected ? 200 : 503).json({ storage: result });\n});"
new_status = "apiRouter.get('/storage-status', async (_req: Request, res: Response) => {\n  const result = await checkStorageConnection();\n  return res.status(result.connected ? 200 : 503).json({\n    storage: result,\n    mediaCdn: mediaCdnStatus()\n  });\n});"
if old_status not in text:
    raise SystemExit('storage-status anchor not found')
text = text.replace(old_status, new_status, 1)

old_delivery = "  try {\n    // Authorize here, but send the browser straight to object storage. Render\n    // transfers only this small redirect—not the image or video bytes.\n    const downloadUrl = await createDownloadUrl(requestedStorageKey);"
new_delivery = "  try {\n    // Public, deployed archives can use a stable Cloudflare media URL. The\n    // Worker fetches this endpoint back with a shared origin header, so private\n    // and draft authorization remains enforced here instead of at the CDN.\n    const cdnUrl = publicMediaCdnUrl(archive, fileName, req.header('x-oncehere-cdn-origin'));\n    if (cdnUrl) {\n      res.setHeader('Cache-Control', 'public, max-age=300');\n      res.setHeader('Referrer-Policy', 'no-referrer');\n      return res.redirect(302, cdnUrl);\n    }\n\n    // CDN disabled, non-public archive, or trusted CDN-origin fetch: send the\n    // client/Worker to a short-lived signed object-storage URL. The application\n    // server transfers only this small redirect, never the image/video bytes.\n    const downloadUrl = await createDownloadUrl(requestedStorageKey);"
if old_delivery not in text:
    raise SystemExit('media delivery anchor not found')
text = text.replace(old_delivery, new_delivery, 1)

api.write_text(text)

/**
 * Static asset serving.
 *   GET /assets/beverly-logo.png — the official Beverly lockup, referenced by
 *   transactional emails (email clients need an absolute, publicly reachable
 *   URL — they cannot use the SPA's bundled /brand/* paths).
 */
import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(here, '..', 'emails', 'assets', 'beverly-logo.png');
let cachedLogo: Buffer | null = null;

const route: FastifyPluginAsync = async (fastify) => {
    fastify.get('/assets/beverly-logo.png', async (_req, reply) => {
        if (!cachedLogo) {
            cachedLogo = fs.readFileSync(LOGO_PATH);
        }
        reply.header('Content-Type', 'image/png');
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        // Helmet's default same-origin CORP would block this from loading in any
        // cross-origin context (email preview panes, mail client webviews, etc.) —
        // this asset is specifically meant to be embedded anywhere.
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        return reply.send(cachedLogo);
    });
};

export default route;

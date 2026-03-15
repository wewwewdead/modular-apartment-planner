/**
 * Build-time script to generate sitemap XML files.
 * Run during build: node scripts/generate-sitemaps.js
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, '..', 'dist');
const API_DIR = resolve(DIST_DIR, 'api');

const SITE_URL = 'https://iskrib.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_API_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const escXml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const makePostUrl = (journalId, title = '') => {
    const slug = title
        ? title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        : '';
    return `${SITE_URL}/home/post/${journalId}${slug ? '/' + slug : ''}`;
};

const run = async () => {
    mkdirSync(API_DIR, { recursive: true });

    // Generate posts sitemap
    const { data: posts, error: postsError } = await supabase
        .from('journals')
        .select('id, title, created_at')
        .eq('privacy', 'public')
        .order('created_at', { ascending: false });

    if (postsError) {
        console.error('Failed to fetch posts:', postsError.message);
    }

    const postUrls = (posts || []).map((post) => {
        const loc = escXml(makePostUrl(post.id, post.title || ''));
        const lastmod = post.created_at
            ? new Date(post.created_at).toISOString().split('T')[0]
            : '';
        return `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
    });

    const postsXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${postUrls.join('\n')}\n</urlset>`;
    writeFileSync(resolve(API_DIR, 'sitemap-posts.xml'), postsXml);
    console.log(`Generated sitemap-posts.xml (${posts?.length || 0} posts)`);

    // Generate profiles sitemap
    const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, username')
        .not('username', 'is', null);

    if (usersError) {
        console.error('Failed to fetch users:', usersError.message);
    }

    const profileUrls = (users || []).map((user) => {
        const loc = escXml(`${SITE_URL}/u/${user.username}`);
        return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
    });

    const profilesXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${profileUrls.join('\n')}\n</urlset>`;
    writeFileSync(resolve(API_DIR, 'sitemap-profiles.xml'), profilesXml);
    console.log(`Generated sitemap-profiles.xml (${users?.length || 0} profiles)`);

    // Generate sitemap index
    const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${escXml(`${SITE_URL}/sitemap.xml`)}</loc>
  </sitemap>
  <sitemap>
    <loc>${escXml(`${SITE_URL}/api/sitemap-posts.xml`)}</loc>
  </sitemap>
  <sitemap>
    <loc>${escXml(`${SITE_URL}/api/sitemap-profiles.xml`)}</loc>
  </sitemap>
</sitemapindex>`;
    writeFileSync(resolve(API_DIR, 'sitemap-index.xml'), indexXml);
    console.log('Generated sitemap-index.xml');
};

run().catch((err) => {
    console.error('Sitemap generation error:', err);
    process.exit(1);
});

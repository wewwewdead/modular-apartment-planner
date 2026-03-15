export const SITE_NAME = "Iskryb";
export const SITE_URL = "https://iskrib.com";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/no-image.png`;
export const DEFAULT_OG_IMAGE_WIDTH = 1200;
export const DEFAULT_OG_IMAGE_HEIGHT = 630;

export const DEFAULT_SEO = {
  title: `${SITE_NAME} | Social Journaling and Opinions`,
  description:
    "Iskryb is a social journaling platform where you can publish journals, share opinions, and organize collections.",
  canonicalPath: "/",
  robots: "index,follow",
};

export const SEO_ROUTES = [
  {
    path: "/",
    title: `${SITE_NAME} | Social Journaling and Opinions`,
    description:
      "Publish journals, share opinions, and build collections in one social writing platform.",
    canonicalPath: "/",
    robots: "index,follow",
    prerender: true,
    sitemap: { changefreq: "daily", priority: "1.0" },
  },
  {
    path: "/home",
    title: `${SITE_NAME} Home Feed`,
    description:
      "Explore journals and ideas from the Iskryb community in the home feed.",
    canonicalPath: "/home",
    robots: "index,follow",
    prerender: true,
    sitemap: { changefreq: "daily", priority: "0.9" },
  },
  {
    path: "/home/opinions",
    title: `${SITE_NAME} Opinions`,
    description:
      "Read and respond to community opinions on Iskryb with threaded discussions.",
    canonicalPath: "/home/opinions",
    robots: "index,follow",
    prerender: true,
    sitemap: { changefreq: "daily", priority: "0.8" },
  },
  {
    path: "/home/explore",
    title: `${SITE_NAME} Explore`,
    description:
      "Discover the hottest posts and search across community journals on Iskryb.",
    canonicalPath: "/home/explore",
    robots: "index,follow",
    prerender: true,
    sitemap: { changefreq: "daily", priority: "0.8" },
  },
  {
    path: "/home/gallery",
    title: `${SITE_NAME} Gallery`,
    description:
      "Browse visual canvas posts in Iskryb Gallery with community doodles, stamps, and remixes.",
    canonicalPath: "/home/gallery",
    robots: "index,follow",
    prerender: true,
    sitemap: { changefreq: "daily", priority: "0.8" },
  },
  {
    path: "/home/freedom-wall",
    title: `${SITE_NAME} Freedom Wall`,
    description:
      "Join the live weekly Freedom Wall to doodle, drop stickers and stamps, and leave colorful notes with the community.",
    canonicalPath: "/home/freedom-wall",
    robots: "index,follow",
    prerender: true,
    sitemap: { changefreq: "daily", priority: "0.8" },
  },
  {
    path: "/login",
    title: `Log In | ${SITE_NAME}`,
    description: `Log in to ${SITE_NAME} to continue writing and engaging with the community.`,
    canonicalPath: "/login",
    robots: "noindex,follow",
    prerender: true,
  },
  {
    path: "/signUp",
    title: `Sign Up | ${SITE_NAME}`,
    description:
      "Create an Iskryb account to publish journals, share opinions, and curate collections.",
    canonicalPath: "/signUp",
    robots: "noindex,follow",
    prerender: true,
  },
];

const DYNAMIC_PATTERNS = [
  {
    test: (pathname) => /^\/home\/post\/[^/]+(?:\/[^/]+)?$/.test(pathname),
    seo: (pathname) => {
      const match = pathname.match(/^\/home\/post\/([^/]+)/);
      const journalId = match ? match[1] : null;
      return {
        title: `${SITE_NAME} Post`,
        description: "Read community journals and discussions on Iskryb.",
        canonicalPath: journalId ? `/home/post/${journalId}` : null,
        robots: "index,follow",
      };
    },
  },
  {
    test: (pathname) => /^\/u\/[^/]+/.test(pathname),
    seo: (pathname) => {
      const username = pathname.split("/")[2];
      return {
        title: `${username}'s Profile | ${SITE_NAME}`,
        description: `View ${username}'s journals and opinions on Iskryb.`,
        canonicalPath: `/u/${username}`,
        robots: "index,follow",
      };
    },
  },
];

export const buildAbsoluteUrl = (pathOrUrl = "/") => {
  if (!pathOrUrl) {
    return `${SITE_URL}/`;
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return new URL(pathOrUrl, `${SITE_URL}/`).toString();
};

export const getSeoForPath = (pathname) => {
  const normalized = pathname || "/";
  const exactMatch = SEO_ROUTES.find((route) => route.path === normalized);
  if (exactMatch) {
    return { ...DEFAULT_SEO, ...exactMatch };
  }

  const dynamicMatch = DYNAMIC_PATTERNS.find((entry) => entry.test(normalized));
  if (dynamicMatch) {
    const seo = typeof dynamicMatch.seo === "function"
      ? dynamicMatch.seo(normalized)
      : dynamicMatch.seo;
    return { ...DEFAULT_SEO, ...seo };
  }

  return { ...DEFAULT_SEO };
};

export const getPrerenderRoutes = () =>
  SEO_ROUTES.filter((route) => route.prerender).map((route) => route.path);

export const getSitemapRoutes = () =>
  SEO_ROUTES.filter((route) => route.sitemap).map((route) => ({
    path: route.path,
    ...route.sitemap,
  }));

export const buildWebsiteSchema = (canonicalUrl) => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: canonicalUrl,
});

export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: DEFAULT_OG_IMAGE,
};

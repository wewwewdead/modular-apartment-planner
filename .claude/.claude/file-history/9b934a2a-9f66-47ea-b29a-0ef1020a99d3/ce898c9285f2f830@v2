import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_HEIGHT,
  DEFAULT_OG_IMAGE_WIDTH,
  ORGANIZATION_SCHEMA,
  buildAbsoluteUrl,
  buildWebsiteSchema,
  getSeoForPath,
} from "./seoConfig.js";
import { ensureMeta, removeElementById, ensureLink, ensureJsonLd } from "./seoUtils.js";

const SeoManager = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const seo = getSeoForPath(pathname);
    const canonicalUrl = buildAbsoluteUrl(seo.canonicalPath || pathname);
    const ogTitle = seo.ogTitle || seo.title;
    const ogDescription = seo.ogDescription || seo.description;
    const ogImage = seo.ogImage || DEFAULT_OG_IMAGE;
    const fbAppId = (import.meta.env.VITE_FB_APP_ID || "").trim();

    document.title = seo.title;

    ensureMeta("seo-description", "name", "description", seo.description);
    ensureMeta("seo-robots", "name", "robots", seo.robots || "index,follow");

    ensureMeta("seo-og-type", "property", "og:type", "website");
    ensureMeta("seo-og-url", "property", "og:url", canonicalUrl);
    ensureMeta("seo-og-title", "property", "og:title", ogTitle);
    ensureMeta("seo-og-description", "property", "og:description", ogDescription);
    ensureMeta("seo-og-image", "property", "og:image", ogImage);
    ensureMeta("seo-og-image-width", "property", "og:image:width", String(DEFAULT_OG_IMAGE_WIDTH));
    ensureMeta("seo-og-image-height", "property", "og:image:height", String(DEFAULT_OG_IMAGE_HEIGHT));
    ensureMeta("seo-og-site-name", "property", "og:site_name", "Iskryb");
    if (fbAppId) {
      ensureMeta("seo-fb-app-id", "property", "fb:app_id", fbAppId);
    } else {
      removeElementById("seo-fb-app-id");
    }

    ensureMeta("seo-twitter-card", "name", "twitter:card", "summary_large_image");
    ensureMeta("seo-twitter-title", "name", "twitter:title", ogTitle);
    ensureMeta("seo-twitter-description", "name", "twitter:description", ogDescription);
    ensureMeta("seo-twitter-image", "name", "twitter:image", ogImage);
    ensureMeta("seo-twitter-image-width", "name", "twitter:image:width", String(DEFAULT_OG_IMAGE_WIDTH));
    ensureMeta("seo-twitter-image-height", "name", "twitter:image:height", String(DEFAULT_OG_IMAGE_HEIGHT));

    ensureLink("seo-canonical", "canonical", canonicalUrl);
    ensureLink("seo-hreflang-en", "alternate", canonicalUrl, { hreflang: "en-US" });
    ensureLink("seo-hreflang-default", "alternate", canonicalUrl, {
      hreflang: "x-default",
    });

    ensureJsonLd("seo-ld-website", buildWebsiteSchema(canonicalUrl));
    ensureJsonLd("seo-ld-organization", ORGANIZATION_SCHEMA);
  }, [pathname]);

  return null;
};

export default SeoManager;

import { useEffect } from "react";
import { ensureMeta, ensureJsonLd, ensureLink, removeElementById } from "./seoUtils.js";
import { SITE_URL, buildAbsoluteUrl } from "./seoConfig.js";
import extractPostImage from "./extractPostImage.js";

const POST_SEO_IDS = [
  "post-seo-og-type",
  "post-seo-og-title",
  "post-seo-og-description",
  "post-seo-og-image",
  "post-seo-og-url",
  "post-seo-twitter-title",
  "post-seo-twitter-description",
  "post-seo-twitter-image",
  "post-seo-article-ld",
  "post-seo-canonical",
];

const toPreviewText = (value, maxLength = 160) => {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
};

const usePostSeo = (postData) => {
  useEffect(() => {
    if (!postData?.title) return;

    const title = `${postData.title} | Iskryb`;
    const description = toPreviewText(postData.wholeText) || `Read "${postData.title}" on Iskryb`;
    const postUrl = postData.journalId
      ? buildAbsoluteUrl(`/home/post/${postData.journalId}`)
      : "";
    const ogImage = extractPostImage(postData.content) || `${SITE_URL}/assets/no-image.png`;

    document.title = title;

    ensureMeta("seo-description", "name", "description", description);

    ensureMeta("post-seo-og-type", "property", "og:type", "article");
    ensureMeta("post-seo-og-title", "property", "og:title", postData.title);
    ensureMeta("post-seo-og-description", "property", "og:description", description);
    ensureMeta("post-seo-og-image", "property", "og:image", ogImage);
    if (postUrl) {
      ensureMeta("post-seo-og-url", "property", "og:url", postUrl);
    }

    ensureMeta("post-seo-twitter-title", "name", "twitter:title", postData.title);
    ensureMeta("post-seo-twitter-description", "name", "twitter:description", description);
    ensureMeta("post-seo-twitter-image", "name", "twitter:image", ogImage);

    if (postUrl) {
      ensureLink("post-seo-canonical", "canonical", postUrl);
    }

    const articleLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: postData.title,
      description: description,
      datePublished: postData.created_at || undefined,
      author: {
        "@type": "Person",
        name: postData.name || "Unknown",
      },
      publisher: {
        "@type": "Organization",
        name: "Iskryb",
        url: SITE_URL,
      },
    };
    if (postUrl) articleLd.mainEntityOfPage = postUrl;
    if (ogImage) articleLd.image = ogImage;

    ensureJsonLd("post-seo-article-ld", articleLd);

    return () => {
      document.title = "Iskryb | Social Journaling and Opinions";
      POST_SEO_IDS.forEach(removeElementById);
    };
  }, [
    postData?.title,
    postData?.wholeText,
    postData?.journalId,
    postData?.name,
    postData?.created_at,
    postData?.content,
  ]);
};

export default usePostSeo;

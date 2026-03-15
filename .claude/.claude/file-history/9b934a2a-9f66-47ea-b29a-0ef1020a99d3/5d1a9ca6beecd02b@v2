/**
 * Walk Lexical JSON content to find the first image src.
 * Returns the src string or null.
 */
const extractPostImage = (contentJson) => {
  try {
    const parsed = typeof contentJson === "string" ? JSON.parse(contentJson) : contentJson;
    if (!parsed?.root) return null;

    const walk = (node) => {
      if (!node || typeof node !== "object") return null;

      const nodeType = String(node.type || "").toLowerCase();
      if (nodeType === "image" || nodeType.includes("image")) {
        const src = node.src || node.url || node.image_url || node.imageUrl;
        if (typeof src === "string" && src.trim()) return src.trim();
      }

      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          const result = walk(child);
          if (result) return result;
        }
      }

      return null;
    };

    return walk(parsed.root);
  } catch {
    return null;
  }
};

export default extractPostImage;

export const ensureMeta = (id, attribute, key, content) => {
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement("meta");
    element.id = id;
    document.head.appendChild(element);
  }

  element.setAttribute(attribute, key);
  element.setAttribute("content", content);
};

export const removeElementById = (id) => {
  const element = document.getElementById(id);
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
};

export const ensureLink = (id, rel, href, extra = {}) => {
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement("link");
    element.id = id;
    document.head.appendChild(element);
  }

  element.setAttribute("rel", rel);
  element.setAttribute("href", href);
  Object.entries(extra).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });
};

export const ensureJsonLd = (id, payload) => {
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement("script");
    element.id = id;
    element.type = "application/ld+json";
    document.head.appendChild(element);
  }

  element.textContent = JSON.stringify(payload);
};

// src/utils/proxy.js
export function proxyInstagramUrl(instagramUrl) {
  if (!instagramUrl) return "";
  const encoded = encodeURIComponent(instagramUrl);
  return `http://localhost:5001/proxy-image?url=${encoded}`;
}
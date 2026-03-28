/** Mirrors [Master-Mouse/lib/config/app_config.dart] `publicImageBucketUrl`. */
export const PUBLIC_IMAGE_BUCKET_URL =
  import.meta.env.VITE_PUBLIC_IMAGE_BUCKET_URL ??
  "https://pub-294e8dc8ce1a4f2187241207732e8702.r2.dev";

export function publicBannerUrl(bannerImage: string): string {
  const s = bannerImage.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `${PUBLIC_IMAGE_BUCKET_URL.replace(/\/$/, "")}/${s.replace(/^\//, "")}`;
}

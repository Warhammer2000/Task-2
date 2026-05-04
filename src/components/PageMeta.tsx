import { Helmet } from "react-helmet-async";

interface PageMetaProps {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article" | "profile";
}

/**
 * Sets <title>, meta description, Open Graph, and Twitter Card tags.
 * Used on Event and Host pages for share previews (R9).
 */
export function PageMeta({ title, description, image, url, type = "website" }: PageMetaProps) {
  const fullTitle = title.length > 60 ? title.slice(0, 57) + "..." : title;
  const desc = description ? (description.length > 160 ? description.slice(0, 157) + "..." : description) : undefined;
  const canonical = url ?? (typeof window !== "undefined" ? window.location.href : undefined);

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {desc && <meta name="description" content={desc} />}
      {canonical && <link rel="canonical" href={canonical} />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      {desc && <meta property="og:description" content={desc} />}
      <meta property="og:type" content={type} />
      {image && <meta property="og:image" content={image} />}
      {canonical && <meta property="og:url" content={canonical} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {desc && <meta name="twitter:description" content={desc} />}
      {image && <meta name="twitter:image" content={image} />}
    </Helmet>
  );
}

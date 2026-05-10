"use client";

import { useState } from "react";
import { proxiedImageUrl } from "@/lib/proxy-image";

type Props = {
  remoteUrl: string | null | undefined;
  alt: string;
  className: string;
  imgClassName?: string;
};

export function SafeArticleImage({
  remoteUrl,
  alt,
  className,
  imgClassName = "h-full w-full object-cover",
}: Props) {
  const [failed, setFailed] = useState(false);
  const proxied = proxiedImageUrl(remoteUrl);

  if (!proxied || failed) {
    return <div className={className} aria-hidden />;
  }

  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxied}
        alt={alt}
        className={imgClassName}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

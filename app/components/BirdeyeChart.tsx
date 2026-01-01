"use client";

import { useState } from "react";

type Props = {
  tokenMint: string;
  chain?: string;
  height?: number;
  theme?: "dark" | "light";
};

export default function BirdeyeChart({ tokenMint, chain = "solana", height = 400, theme = "dark" }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (!tokenMint) return null;

  const chartUrl = `https://birdeye.so/tv-widget/${encodeURIComponent(tokenMint)}?chain=${chain}&viewMode=pair&chartInterval=1D&chartType=CANDLE&chartTimezone=America%2FNew_York&chartLeftToolbar=hide&theme=${theme}`;

  return (
    <div className="birdeyeChartWrap">
      {isLoading && !hasError && (
        <div className="birdeyeChartLoading">
          <div className="birdeyeChartSpinner" />
          <span>Loading chart...</span>
        </div>
      )}
      {hasError && (
        <div className="birdeyeChartError">
          <span>Chart unavailable</span>
          <a
            href={`https://birdeye.so/token/${encodeURIComponent(tokenMint)}?chain=${chain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="birdeyeChartLink"
          >
            View on Birdeye →
          </a>
        </div>
      )}
      <iframe
        src={chartUrl}
        width="100%"
        height={height}
        frameBorder="0"
        allowFullScreen
        style={{ 
          display: hasError ? "none" : "block",
          opacity: isLoading ? 0 : 1,
          transition: "opacity 0.3s ease",
          borderRadius: 12,
        }}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </div>
  );
}

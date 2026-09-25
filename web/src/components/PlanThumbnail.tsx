import React, { useEffect, useState } from "react";
import { getToken, getApiUrl } from "@/lib/apiClient";

interface PlanThumbnailProps {
  planId: string;
  width?: number;
  height?: number;
  alt?: string;
}

const PlanThumbnail: React.FC<PlanThumbnailProps> = ({ planId, width = 480, height = 480, alt = "Plan thumbnail" }) => {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    getToken().then(setToken);
  }, []);

  // Use API path instead of public path
  // Also try different zoom levels since 0 might not exist
  const tilePaths = [
    `/api/tiles/${planId}/0/0/0.png`,
    `/api/tiles/${planId}/1/0/0.png`,
    `/api/tiles/${planId}/2/0/0.png`,
  ];
  const [srcIdx, setSrcIdx] = React.useState(0);

  // Construct URL with token if available
  const currentPath = tilePaths[srcIdx] + (token ? `?token=${token}` : "");

  return (
    <div style={{ width, height, border: "1px solid #ccc", borderRadius: 8, overflow: "hidden", background: "#f8f8f8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {token ? (
        <img
          src={getApiUrl(currentPath)}
          alt={alt}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#eee" }}
          onError={() => setSrcIdx(idx => (idx < tilePaths.length - 1 ? idx + 1 : idx))}
        />
      ) : (
        <div style={{ opacity: 0.5 }}>Loading...</div>
      )}
    </div>
  );
};

export default PlanThumbnail;

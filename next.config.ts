import type { NextConfig } from "next";
import { toNextRedirects } from "./lib/content/redirects";

// 旧マーケットのサブタイプ・ルートを 3 カテゴリ統合IAへ恒久リダイレクト（チェーンなし）。
const marketRedirects = [
  { source: "/community/market/farm_job", destination: "/community/market/job?subcategory=farm", permanent: true },
  { source: "/community/market/roommate", destination: "/community/market/housing?subcategory=sharemate", permanent: true },
  { source: "/community/market/vehicle", destination: "/community/market/marketplace?subcategory=vehicle", permanent: true },
];

const nextConfig: NextConfig = {
  images: {
    // 記事の写真・スクリーンショットを次世代フォーマットで配信する。
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    return [...toNextRedirects(), ...marketRedirects];
  },
};

export default nextConfig;

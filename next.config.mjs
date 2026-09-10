/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingExcludes: {
    "/*": ["./.env", "./.env.*", "./.data/**", "./artifacts/**"],
  },
};

export default nextConfig;

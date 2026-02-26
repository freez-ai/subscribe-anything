/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['isolated-vm', 'better-sqlite3'],
};

export default nextConfig;

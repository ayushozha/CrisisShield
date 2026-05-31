/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The live Daily/Pipecat client SDKs are optionalDependencies; the build does
  // not require them (fixture mode needs none of them).
};

export default nextConfig;

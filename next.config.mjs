/** @type {import('next').NextConfig} */
// bodySizeLimit: the document register accepts files up to 5 MB, and server actions default to 1 MB.
export default { poweredByHeader: false, reactStrictMode: true, experimental: { serverActions: { bodySizeLimit: "6mb" } } };

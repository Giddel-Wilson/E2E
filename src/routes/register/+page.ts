// This page generates keypairs and derives keys with libsodium, which must
// run in the browser. Disabling SSR here avoids Vite trying (and failing)
// to execute libsodium's module on the server during render.
export const ssr = false;

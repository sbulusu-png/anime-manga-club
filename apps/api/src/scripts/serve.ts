// Applies pending migrations, then starts the API: for hosts without a release step
// (Render's free plan runs no pre-deploy command). node dist/scripts/serve.js
// A failed migration stops here, so the new version never serves an old schema.
await import("./migrate.js");
await import("../index.js");

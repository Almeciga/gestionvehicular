// Last-resort guard for the shared serverless function.
//
// Netlify's Next.js runtime serves every page, API route and prerendered
// response from a single Lambda, so an unhandled rejection anywhere kills the
// Node process and every in-flight or subsequent request 502s — including
// unrelated routes like /login. Logging instead of letting the default handler
// terminate the process turns that into a single failed request.
//
// Anything logged with the prefix below is a real bug that escaped a promise
// chain and should be fixed at its source, not left to this handler.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  process.on('unhandledRejection', (reason) => {
    console.error('[instrumentation] unhandledRejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[instrumentation] uncaughtException:', error);
  });
}

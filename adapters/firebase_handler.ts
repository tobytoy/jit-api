/**
 * JIT Protocol Synthesis Framework - Firebase Functions Adapter
 * 
 * Wraps JIT API or Express Server for Firebase Functions v2 / Google Cloud Functions.
 */

export interface FirebaseHandlerOptions {
  region?: string;
  cors?: boolean;
}

export function createFirebaseHandler(app: any, options?: FirebaseHandlerOptions) {
  // Returns a function conforming to (req, res) => app(req, res)
  return function firebaseRequestHandler(req: any, res: any) {
    if (options?.cors) {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
    }
    return app(req, res);
  };
}

export const config = { runtime: 'edge' };

export default function handler(req) {
  return new Response(
    JSON.stringify({ key: process.env.ANTHROPIC_KEY || '' }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
}

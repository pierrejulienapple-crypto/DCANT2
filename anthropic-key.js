export default function handler(req) {
  return new Response(
    JSON.stringify({ key: process.env.ANTHROPIC_KEY || '' }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  );
}

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
      <h1>ReelReady API</h1>
      <p>AI-powered real estate video pipeline.</p>
      <p>Endpoints:</p>
      <ul>
        <li><code>POST /api/properties</code> — Upload photos + start pipeline</li>
        <li><code>GET /api/properties</code> — List properties</li>
        <li><code>GET /api/properties/:id/status</code> — Track progress</li>
        <li><code>GET /api/stats/overview</code> — Dashboard metrics</li>
        <li><code>GET /api/logs</code> — Pipeline logs</li>
      </ul>
    </main>
  );
}

/**
 * Creates an SSE (Server-Sent Events) ReadableStream Response.
 *
 * Usage:
 *   return sseStream(async (emit) => {
 *     emit({ type: 'text', content: 'hello' });
 *     await someAsyncWork();
 *     emit({ type: 'done' });
 *   });
 */
export function sseStream(
  generator: (emit: (data: unknown) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };
      try {
        await generator(emit);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', message })}\n\n`
            )
          );
        } catch {
          // controller may already be closed
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering
    },
  });
}

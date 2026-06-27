import { DurableObject } from "cloudflare:workers";

/**
 * Per-user realtime hub. Holds the user's open SSE connections and relays
 * lightweight invalidation signals to them. One instance per user
 * (`getByName(userId)`). A pure in-memory relay: no storage and no business
 * logic — clients re-fetch through the REST API whenever a signal arrives.
 */
export class UserHub extends DurableObject<Env> {
	// Open SSE writers. Kept in memory while ≥1 connection is held; the DO is
	// evicted (resetting this) only once every connection has closed.
	private readonly writers = new Set<WritableStreamDefaultWriter<Uint8Array>>();
	private readonly encoder = new TextEncoder();
	private keepAlive: ReturnType<typeof setInterval> | null = null;

	override async fetch(request: Request): Promise<Response> {
		const { readable, writable } = new TransformStream<
			Uint8Array,
			Uint8Array
		>();
		const writer = writable.getWriter();
		this.writers.add(writer);
		this.startKeepAlive();
		// Drop the connection as soon as the client disconnects (e.g. tab close),
		// instead of waiting for the next write to fail.
		request.signal.addEventListener("abort", () => this.drop(writer));
		// Initial comment so proxies flush the response headers and the client's
		// EventSource `onopen` fires promptly.
		void writer.write(this.encoder.encode(": connected\n\n")).catch(() => {
			this.drop(writer);
		});
		return new Response(readable, {
			headers: {
				"content-type": "text/event-stream",
				"cache-control": "no-cache, no-transform",
			},
		});
	}

	/** RPC: relay one already-serialized event to every open connection. */
	async publish(payload: string): Promise<void> {
		this.flush(this.encoder.encode(`data: ${payload}\n\n`));
	}

	// Fire-and-forget per writer: a single slow or backpressured client must not
	// stall delivery to the others or pile up awaited background tasks. A rejected
	// write means the client went away, so reap that connection.
	private flush(frame: Uint8Array): void {
		for (const writer of [...this.writers]) {
			writer.write(frame).catch(() => this.drop(writer));
		}
	}

	private drop(writer: WritableStreamDefaultWriter<Uint8Array>): void {
		this.writers.delete(writer);
		writer.close().catch(() => {});
		if (this.writers.size === 0) this.stopKeepAlive();
	}

	// A periodic comment keeps intermediaries from closing an idle connection and
	// surfaces dropped clients (a failed write reaps them) between real events.
	private startKeepAlive(): void {
		if (this.keepAlive) return;
		this.keepAlive = setInterval(() => {
			this.flush(this.encoder.encode(": ping\n\n"));
		}, 30_000);
	}

	private stopKeepAlive(): void {
		if (!this.keepAlive) return;
		clearInterval(this.keepAlive);
		this.keepAlive = null;
	}
}

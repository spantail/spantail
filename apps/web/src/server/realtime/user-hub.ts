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

	override async fetch(_request: Request): Promise<Response> {
		const { readable, writable } = new TransformStream<
			Uint8Array,
			Uint8Array
		>();
		const writer = writable.getWriter();
		this.writers.add(writer);
		this.startKeepAlive();
		// Initial comment so proxies flush the response headers and the client's
		// EventSource `onopen` fires promptly.
		void writer.write(this.encoder.encode(": connected\n\n")).catch(() => {
			this.drop(writer);
		});
		return new Response(readable, {
			headers: {
				"content-type": "text/event-stream",
				"cache-control": "no-cache, no-transform",
				connection: "keep-alive",
			},
		});
	}

	/** RPC: relay one already-serialized event to every open connection. */
	async publish(payload: string): Promise<void> {
		await this.flush(this.encoder.encode(`data: ${payload}\n\n`));
	}

	private async flush(frame: Uint8Array): Promise<void> {
		const dead: WritableStreamDefaultWriter<Uint8Array>[] = [];
		await Promise.all(
			[...this.writers].map((w) => w.write(frame).catch(() => dead.push(w))),
		);
		// A failed write means the client went away; reap that connection.
		for (const w of dead) this.drop(w);
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
			void this.flush(this.encoder.encode(": ping\n\n"));
		}, 30_000);
	}

	private stopKeepAlive(): void {
		if (!this.keepAlive) return;
		clearInterval(this.keepAlive);
		this.keepAlive = null;
	}
}

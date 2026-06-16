import { AppError } from "../errors";

export interface SendArgs {
	to: string;
	subject: string;
	html: string;
	text: string;
}

export interface Mailer {
	send(args: SendArgs): Promise<void>;
}

export interface OutboxEntry extends SendArgs {
	id: string;
	sentAt: string;
}

// In-memory dev outbox. Captures messages instead of sending them so local
// development can read the body and follow the real invitation link. Cleared
// when the worker isolate restarts — adequate for development only.
const outbox: OutboxEntry[] = [];

export function getOutbox(): readonly OutboxEntry[] {
	return outbox;
}

export function clearOutbox(): void {
	outbox.length = 0;
}

function isProduction(env: Env): boolean {
	return env.APP_ENV === "production";
}

class CloudflareMailer implements Mailer {
	constructor(
		private readonly env: Env,
		private readonly fromAddress: string,
		private readonly fromName: string | null,
	) {}

	async send({ to, subject, html, text }: SendArgs): Promise<void> {
		// Cloudflare Email Service (public beta): structured builder API.
		await this.env.EMAIL.send({
			from: this.fromName
				? `${this.fromName} <${this.fromAddress}>`
				: this.fromAddress,
			to,
			subject,
			html,
			text,
		});
	}
}

class DevOutboxMailer implements Mailer {
	async send(args: SendArgs): Promise<void> {
		outbox.unshift({
			...args,
			id: crypto.randomUUID(),
			sentAt: new Date().toISOString(),
		});
	}
}

/**
 * Picks the transport: the in-memory dev outbox unless APP_ENV is "production",
 * where it sends via the Cloudflare Email Service binding. The instance email
 * toggle (emailEnabled) is checked by callers before sending.
 */
export function getMailer(
	env: Env,
	from: { address: string | null; name: string | null },
): Mailer {
	if (!isProduction(env)) return new DevOutboxMailer();
	if (!from.address) {
		throw new AppError("internal", "Email from address is not configured");
	}
	return new CloudflareMailer(env, from.address, from.name);
}

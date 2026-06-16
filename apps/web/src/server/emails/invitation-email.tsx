import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import { render } from "@react-email/render";

export interface InvitationEmailProps {
	inviteUrl: string;
}

const main = { backgroundColor: "#f6f6f7", fontFamily: "sans-serif" };
const container = {
	margin: "0 auto",
	padding: "24px",
	maxWidth: "480px",
	backgroundColor: "#ffffff",
};
const heading = { fontSize: "20px", fontWeight: "600" as const };
const paragraph = { fontSize: "14px", lineHeight: "22px", color: "#3c3c43" };
const button = {
	backgroundColor: "#111111",
	color: "#ffffff",
	borderRadius: "8px",
	padding: "10px 16px",
	fontSize: "14px",
	textDecoration: "none",
};
const link = {
	fontSize: "12px",
	color: "#6b7280",
	wordBreak: "break-all" as const,
};

// One Toxil deployment serves one company but its members may differ in
// language, so the invitation is bilingual (en + ja) rather than wired to the
// SPA-only i18n catalogs.
export function InvitationEmail({ inviteUrl }: InvitationEmailProps) {
	return (
		<Html>
			<Head />
			<Preview>You have been invited to Toxil / Toxil に招待されました</Preview>
			<Body style={main}>
				<Container style={container}>
					<Section>
						<Heading style={heading}>You're invited to Toxil</Heading>
						<Text style={paragraph}>
							You have been invited to join Toxil. Set up your account using the
							button below. This link expires soon.
						</Text>
						<Button href={inviteUrl} style={button}>
							Accept invitation
						</Button>
						<Text style={link}>{inviteUrl}</Text>
					</Section>
					<Hr />
					<Section>
						<Heading style={heading}>Toxil に招待されました</Heading>
						<Text style={paragraph}>
							Toxil
							に招待されました。下のボタンからアカウントを設定してください。このリンクは間もなく失効します。
						</Text>
						<Button href={inviteUrl} style={button}>
							招待を受ける
						</Button>
						<Text style={link}>{inviteUrl}</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

export async function renderInvitationEmail(inviteUrl: string): Promise<{
	subject: string;
	html: string;
	text: string;
}> {
	const node = <InvitationEmail inviteUrl={inviteUrl} />;
	const html = await render(node);
	const text = await render(node, { plainText: true });
	return {
		subject: "You're invited to Toxil / Toxil に招待されました",
		html,
		text,
	};
}

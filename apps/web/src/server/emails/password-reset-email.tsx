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

export interface PasswordResetEmailProps {
	resetUrl: string;
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

// One Spantail deployment serves one company but its members may differ in
// language, so the email is bilingual (en + ja) rather than wired to the
// SPA-only i18n catalogs.
export function PasswordResetEmail({ resetUrl }: PasswordResetEmailProps) {
	return (
		<Html>
			<Head />
			<Preview>
				Reset your Spantail password / Spantail のパスワードを再設定
			</Preview>
			<Body style={main}>
				<Container style={container}>
					<Section>
						<Heading style={heading}>Reset your password</Heading>
						<Text style={paragraph}>
							We received a request to reset your Spantail password. Use the
							button below to choose a new one. This link expires soon. If you
							didn't request this, you can ignore this email.
						</Text>
						<Button href={resetUrl} style={button}>
							Reset password
						</Button>
						<Text style={link}>{resetUrl}</Text>
					</Section>
					<Hr />
					<Section>
						<Heading style={heading}>パスワードを再設定</Heading>
						<Text style={paragraph}>
							Spantail
							のパスワード再設定リクエストを受け付けました。下のボタンから新しいパスワードを設定してください。このリンクは間もなく失効します。心当たりがない場合はこのメールを無視してください。
						</Text>
						<Button href={resetUrl} style={button}>
							パスワードを再設定
						</Button>
						<Text style={link}>{resetUrl}</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

export async function renderPasswordResetEmail(resetUrl: string): Promise<{
	subject: string;
	html: string;
	text: string;
}> {
	const node = <PasswordResetEmail resetUrl={resetUrl} />;
	const html = await render(node);
	const text = await render(node, { plainText: true });
	return {
		subject: "Reset your Spantail password / Spantail のパスワードを再設定",
		html,
		text,
	};
}

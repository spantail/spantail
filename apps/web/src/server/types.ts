import type { AuthUser, TokenScope } from "@spantail/core";
import type { Database } from "@spantail/db";

export type AuthContext =
	| { user: AuthUser; via: "session" }
	| { user: AuthUser; via: "pat"; scopes: TokenScope[] }
	// Agent access token: a delegated, write-only ingest credential. Carries no
	// AuthUser — it can only ingest agent spans for the bound agent, on behalf
	// of its owner. Consumed solely by requireAgentAuth.
	| {
			via: "agent";
			agentId: string;
			ownerUserId: string;
			defaultWorkspaceId: string | null;
	  };

/** Interactive/PAT auth that carries a user; excludes agent tokens. */
export type UserAuthContext = Exclude<AuthContext, { via: "agent" }>;
export type AgentAuthContext = Extract<AuthContext, { via: "agent" }>;

export type AppEnv = {
	Bindings: Env;
	Variables: {
		db: Database;
		auth: AuthContext | null;
	};
};

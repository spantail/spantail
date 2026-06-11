import type { AuthUser, TokenScope } from "@toxil/core";
import type { Database } from "@toxil/db";

export type AuthContext =
	| { user: AuthUser; via: "session" }
	| { user: AuthUser; via: "pat"; scopes: TokenScope[] };

export type AppEnv = {
	Bindings: Env;
	Variables: {
		db: Database;
		auth: AuthContext | null;
	};
};

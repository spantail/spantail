import type { Database } from "@toxil/db";

export interface AuthUser {
	id: string;
	name: string;
	email: string;
	isAdmin: boolean;
}

export interface AuthContext {
	user: AuthUser;
	via: "session";
}

export type AppEnv = {
	Bindings: Env;
	Variables: {
		db: Database;
		auth: AuthContext | null;
	};
};

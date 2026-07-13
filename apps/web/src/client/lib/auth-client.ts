import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import i18n from "@/i18n";

export const authClient = createAuthClient({
	fetchOptions: {
		// Send the app's active language on auth requests so a bootstrap sign-up
		// (the first user, who becomes the instance admin) seeds the starter
		// templates in the UI language the admin is looking at, matching the
		// SpantailClient's Accept-Language override rather than the raw browser
		// header.
		customFetchImpl: (input, init) => {
			const headers = new Headers(init?.headers);
			headers.set("Accept-Language", i18n.resolvedLanguage ?? i18n.language);
			return fetch(input, { ...init, headers });
		},
	},
	plugins: [
		inferAdditionalFields({
			user: {
				isAdmin: { type: "boolean", input: false },
			},
		}),
	],
});

import type { AuthUser } from "@spantail/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpenIcon, LogOutIcon, UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/lib/query";

// User-scoped menu in the header's top-right corner — deliberately outside
// the workspace-scoped sidebar.
export function NavUser({ user }: { user: AuthUser }) {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();

	const guideUrl = i18n.language.startsWith("ja")
		? "https://docs.spantail.com/ja/guides/"
		: "https://docs.spantail.com/guides/";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={t("nav.userMenu")}
					className="rounded-full data-[state=open]:bg-accent"
				>
					<PersonAvatar name={user.name} imageUrl={user.imageUrl} size={32} />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="min-w-56 rounded-lg"
				align="end"
				sideOffset={4}
			>
				<DropdownMenuLabel className="p-0 font-normal">
					<div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
						<PersonAvatar name={user.name} imageUrl={user.imageUrl} size={32} />
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">{user.name}</span>
							<span className="truncate text-xs">{user.email}</span>
						</div>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem asChild>
						<Link to="/settings/preferences">
							<UserIcon />
							{t("nav.account")}
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<a href={guideUrl} target="_blank" rel="noopener noreferrer">
							<BookOpenIcon />
							{t("nav.userGuide")}
						</a>
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={async () => {
						await authClient.signOut();
						// Drop all cached server state so the next user to sign in on this
						// browser never sees the previous account's data (queries are keyed
						// by workspace, not user).
						queryClient.clear();
						await navigate({ to: "/login" });
					}}
				>
					<LogOutIcon />
					{t("auth.logout")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

import { Link, useNavigate } from "@tanstack/react-router";
import type { AuthUser } from "@toxil/core";
import { LogOutIcon, UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

// User-scoped menu in the header's top-right corner — deliberately outside
// the workspace-scoped sidebar.
export function NavUser({ user }: { user: AuthUser }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const initials = user.name
		.split(/\s+/)
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="rounded-full data-[state=open]:bg-accent"
				>
					<Avatar className="size-8 rounded-lg">
						<AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="min-w-56 rounded-lg"
				align="end"
				sideOffset={4}
			>
				<DropdownMenuLabel className="p-0 font-normal">
					<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
						<Avatar className="size-8 rounded-lg">
							<AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">{user.name}</span>
							<span className="truncate text-xs">{user.email}</span>
						</div>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem asChild>
						<Link to="/settings/authentication">
							<UserIcon />
							{t("nav.account")}
						</Link>
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={async () => {
						await authClient.signOut();
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

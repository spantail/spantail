import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { App, createAppRouter } from "./app";

const router = createAppRouter();

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<App router={router} />
		</StrictMode>,
	);
}

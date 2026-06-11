import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";

function App() {
	return (
		<div className="flex min-h-svh items-center justify-center">
			<h1 className="font-heading text-4xl font-semibold tracking-tight">
				Toxil
			</h1>
		</div>
	);
}

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}

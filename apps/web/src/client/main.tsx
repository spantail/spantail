import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
	return <h1>Toxil</h1>;
}

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}

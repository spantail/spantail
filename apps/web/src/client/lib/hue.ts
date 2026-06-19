/** Stable per-string hue (0–359) — same hash used for person avatars and the
 *  colored dots that mark templates and projects across the reports screen. */
export function hueFromString(value: string): number {
	return (value.charCodeAt(0) * 47 + (value.charCodeAt(1) || 0) * 13) % 360;
}

/** Builtin templates keep the mockup's hand-picked hues; custom templates fall
 *  back to a stable hash so every template gets a consistent color. */
const BUILTIN_TEMPLATE_HUE: Record<string, number> = {
	"builtin:daily": 264,
	"builtin:weekly": 200,
	"builtin:monthly": 150,
};

export function templateHue(templateId: string): number {
	return BUILTIN_TEMPLATE_HUE[templateId] ?? hueFromString(templateId);
}

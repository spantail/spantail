/** Stable per-string hue (0–359) — same hash used for person avatars and the
 *  colored dots that mark templates and projects across the reports screen. */
export function hueFromString(value: string): number {
	return (value.charCodeAt(0) * 47 + (value.charCodeAt(1) || 0) * 13) % 360;
}

/** The single OKLCH colour formula for a hue-based marker (project dots/markers,
 *  template dots, donut slices). Keep the lightness/chroma here so the markers
 *  stay consistent across the app. */
export function projectColor(hue: number): string {
	return `oklch(0.62 0.17 ${hue})`;
}

/** A template's marker hue: a stable hash so every template gets one color. */
export function templateHue(templateId: string): number {
	return hueFromString(templateId);
}

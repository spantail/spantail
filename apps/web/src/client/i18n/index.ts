import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import ja from "./ja.json";

export const LANGUAGE_STORAGE_KEY = "spantail.lang";

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources: {
			en: { translation: en },
			ja: { translation: ja },
		},
		fallbackLng: "en",
		interpolation: { escapeValue: false },
		detection: {
			order: ["localStorage", "navigator"],
			lookupLocalStorage: LANGUAGE_STORAGE_KEY,
			caches: ["localStorage"],
		},
	});

// Keep the document's lang attribute in sync with the active locale. The
// served index.html is static (lang="en"), so without this a ja UI stays
// lang="en" and Chrome offers to translate the page. resolvedLanguage
// normalizes navigator values (e.g. "ja-JP") to a catalog language ("en"/"ja").
const applyDocumentLang = () => {
	document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language;
};
i18n.on("languageChanged", applyDocumentLang);
applyDocumentLang();

export default i18n;

// Bilingual layer: re-exports cyber-kit v0.2.x i18n (zh-HK / en, localStorage `cyber.lang`, ?lang= flag, live DOM)
// and adds two small game-side helpers: tOther() (the other language, for bilingual subtitles) and
// [data-i18n-alt="key"] elements, which always show the *other* language under the main label.
import { i18n, t, addStrings, setLang, getLang, isZh, toggleLang, onLangChange, applyI18n as kitApply, bindToggle, detectLang, LANGS, LANG_KEY } from 'cyber-kit';
export { i18n, t, addStrings, setLang, getLang, isZh, toggleLang, onLangChange, bindToggle, detectLang, LANGS, LANG_KEY };
export const tOther = (key, params) => t(key, params, getLang() === 'zh-HK' ? 'en' : 'zh-HK');
function applyAlt(root = document) { root.querySelectorAll('[data-i18n-alt]').forEach((el) => { const s = tOther(el.dataset.i18nAlt); if (el.textContent !== s) el.textContent = s; }); }
export function applyI18n(root = document) { kitApply(root); applyAlt(root); }
onLangChange(() => applyAlt());

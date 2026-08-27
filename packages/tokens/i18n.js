import { readonly, ref } from 'vue';
import { LANDING_MESSAGES } from './landing-messages.js';

export const LOCALE_STORAGE_KEY = 'beverly.locale';
export const SUPPORTED_LOCALES = Object.freeze([
    { code: 'en', label: 'English', nativeLabel: 'English', intl: 'en-NG' },
    { code: 'yo', label: 'Yoruba', nativeLabel: 'Yorùbá', intl: 'yo-NG' },
    { code: 'ha', label: 'Hausa', nativeLabel: 'Hausa', intl: 'ha-NG' },
    { code: 'ig', label: 'Igbo', nativeLabel: 'Igbo', intl: 'ig-NG' },
]);

const messages = {
    en: {
        'common.language': 'Language',
        'common.chooseLanguage': 'Choose language',
        'common.getStarted': 'Get started',
        'common.signIn': 'Sign in',
        'common.signOut': 'Sign out',
        'common.dashboard': 'Dashboard',
        'common.wallet': 'Wallet',
        'common.buyToken': 'Buy token',
        'common.meters': 'Meters',
        'common.receipts': 'Receipts',
        'common.notifications': 'Notifications',
        'common.profile': 'Profile',
        'common.security': 'Security',
        'common.help': 'Help',
        'common.settings': 'Settings',
        'common.search': 'Search',
        'common.openMenu': 'Open menu',
        'common.closeMenu': 'Close menu',
        'landing.nav.how': 'How it works',
        'landing.nav.features': 'Features',
        'landing.nav.portals': 'Portals',
        'landing.nav.faq': 'FAQ',
        'landing.hero.eyebrow': 'Live across supported sites',
        'landing.hero.titlePrimary': 'Smart power,',
        'landing.hero.titleAccent': 'partnered.',
        'landing.hero.subtitle': 'Buy electricity. Track usage. Keep every receipt.',
        'landing.hero.customerCta': 'Start as customer',
        'landing.hero.vendorCta': 'Open vendor portal',
        'landing.hero.trustOne': 'No setup fees',
        'landing.hero.trustTwo': 'Meter checked first',
        'landing.hero.trustThree': 'Receipts saved',
        'landing.demo.balance': 'Active balance',
        'landing.demo.live': 'Live',
        'landing.demo.funded': 'Wallet funding completed',
        'landing.demo.tokenReady': 'Token ready',
        'landing.demo.paymentConfirmed': 'Payment confirmed',
        'landing.demo.copyToken': 'Copy token',
        'landing.demo.copied': 'Token copied',
        'landing.demo.receiptSaved': 'Receipt saved',
        'landing.demo.connectedMeter': 'Connected meter',
        'landing.demo.consumption': 'Consumption usage',
        'landing.demo.hourly': 'Hourly',
        'landing.demo.daily': 'Daily',
        'landing.demo.liveKw': 'Live kW',
        'landing.demo.peakLoad': 'Peak load 3.2 kW',
        'landing.demo.averageDaily': 'Average 13.7 kWh daily',
        'landing.demo.threePhase': 'Three-phase active',
        'landing.coverage.eyebrow': 'Live coverage',
        'landing.coverage.title': 'One wallet. Every supported site.',
        'landing.coverage.subtitle': 'Coverage comes directly from Beverly’s live station directory.',
        'landing.coverage.mapLabel': 'Nigeria map highlighting states with active Beverly stations',
        'landing.coverage.mapSource': 'Boundary data:',
        'landing.coverage.liveDirectory': 'Active station directory',
        'landing.coverage.siteCount': '{count} live sites',
        'landing.coverage.stateCount': '{count} sites',
        'landing.coverage.locationPending': 'Location pending',
        'landing.coverage.error': 'Live coverage is temporarily unavailable.',
        'landing.coverage.retry': 'Retry',
        'landing.coverage.footnote': 'New stations appear here automatically after activation.',
        'landing.coverage.cta': 'Check your meter',
        'landing.journey.eyebrow': 'Built around real tasks',
        'landing.journey.title': 'One clear journey, from meter to receipt.',
        'landing.journey.subtitle': 'Every step stays visible, verified, and easy to revisit.',
        'landing.journey.step1Title': 'Choose your portal',
        'landing.journey.step1Body': 'Customers buy electricity. Vendors manage vending and float.',
        'landing.journey.step2Title': 'Verify your meter',
        'landing.journey.step2Body': 'Meter and station checks happen before any purchase.',
        'landing.journey.step3Title': 'Keep your records',
        'landing.journey.step3Body': 'Completed transactions retain tokens, receipts, and history.',
    },
    yo: {
        'common.language': 'Èdè',
        'common.chooseLanguage': 'Yan èdè',
        'common.getStarted': 'Bẹ̀rẹ̀ lílo',
        'common.signIn': 'Wọlé',
        'common.signOut': 'Jáde',
        'common.dashboard': 'Àkọsílẹ̀ àpapọ̀',
        'common.wallet': 'Àpò owó',
        'common.buyToken': 'Ra tọ́kìn',
        'common.meters': 'Mítà',
        'common.receipts': 'Àwọn risiti',
        'common.notifications': 'Ìfitónilétí',
        'common.profile': 'Prófáìlì',
        'common.security': 'Ààbò',
        'common.help': 'Ìrànlọ́wọ́',
        'common.settings': 'Ètò',
        'common.search': 'Ṣàwárí',
        'common.openMenu': 'Ṣí àkójọ',
        'common.closeMenu': 'Pa àkójọ',
        'landing.nav.how': 'Bí ó ṣe ń ṣiṣẹ́',
        'landing.nav.features': 'Àwọn ànfààní',
        'landing.nav.portals': 'Àwọn pátákó',
        'landing.nav.faq': 'Ìbéèrè',
        'landing.hero.eyebrow': 'Ń ṣiṣẹ́ ní àwọn ibi tá a ṣe àtìlẹ́yìn',
        'landing.hero.titlePrimary': 'Agbára ọlọ́gbọ́n,',
        'landing.hero.titleAccent': 'papọ̀.',
        'landing.hero.subtitle': 'Ra iná. Tọ́pa lílo. Pa gbogbo risiti mọ́.',
        'landing.hero.customerCta': 'Bẹ̀rẹ̀ gẹ́gẹ́ bí oníbàárà',
        'landing.hero.vendorCta': 'Ṣí pátákó olùtajà',
        'landing.hero.trustOne': 'Kò sí owó ìbẹ̀rẹ̀',
        'landing.hero.trustTwo': 'A kọ́kọ́ ṣàyẹ̀wò mítà',
        'landing.hero.trustThree': 'A pa risiti mọ́',
        'landing.demo.balance': 'Owó tó wà',
        'landing.demo.live': 'Ń ṣiṣẹ́',
        'landing.demo.funded': 'A fi owó sínú àpò',
        'landing.demo.tokenReady': 'Tọ́kìn ti ṣetán',
        'landing.demo.paymentConfirmed': 'A ti fìdí ìsanwó múlẹ̀',
        'landing.demo.copyToken': 'Da tọ́kìn kọ́',
        'landing.demo.copied': 'A ti da tọ́kìn kọ́',
        'landing.demo.receiptSaved': 'A pa risiti mọ́',
        'landing.demo.connectedMeter': 'Mítà tó sopọ̀',
        'landing.demo.consumption': 'Lílo iná',
        'landing.demo.hourly': 'Wákàtí',
        'landing.demo.daily': 'Ojoojúmọ́',
        'landing.demo.liveKw': 'kW lọ́wọ́lọ́wọ́',
        'landing.demo.peakLoad': 'Ẹrù gíga 3.2 kW',
        'landing.demo.averageDaily': 'Àpapọ̀ 13.7 kWh lójoojúmọ́',
        'landing.demo.threePhase': 'Fẹ́ẹ̀sì mẹ́ta ń ṣiṣẹ́',
        'landing.coverage.eyebrow': 'Àgbègbè tó ń ṣiṣẹ́',
        'landing.coverage.title': 'Àpò owó kan. Gbogbo ibi tó ṣiṣẹ́.',
        'landing.coverage.subtitle': 'Àgbègbè yìí wá láti àkójọ ibùdó Beverly lọ́wọ́lọ́wọ́.',
        'landing.coverage.mapLabel': 'Máàpù Nàìjíríà tó fi àwọn ìpínlẹ̀ Beverly hàn',
        'landing.coverage.mapSource': 'Orísun ààlà:',
        'landing.coverage.liveDirectory': 'Àwọn ibùdó tó ń ṣiṣẹ́',
        'landing.coverage.siteCount': 'Ibi {count} ń ṣiṣẹ́',
        'landing.coverage.stateCount': 'Ibi {count}',
        'landing.coverage.locationPending': 'A ń dúró de ibi',
        'landing.coverage.error': 'Àgbègbè tó ń ṣiṣẹ́ kò sí fún ìgbà díẹ̀.',
        'landing.coverage.retry': 'Gbìyànjú lẹ́ẹ̀kan síi',
        'landing.coverage.footnote': 'Àwọn ibùdó tuntun máa farahàn lẹ́yìn ìmúṣiṣẹ́.',
        'landing.coverage.cta': 'Ṣàyẹ̀wò mítà rẹ',
        'landing.journey.eyebrow': 'A kọ́ ọ fún iṣẹ́ gidi',
        'landing.journey.title': 'Ìrìn kan tó ṣe kedere, láti mítà sí risiti.',
        'landing.journey.subtitle': 'Gbogbo ìgbésẹ̀ hàn, a sì lè tún un wò.',
        'landing.journey.step1Title': 'Yan pátákó rẹ',
        'landing.journey.step1Body': 'Oníbàárà ń ra iná. Olùtajà ń ṣakoso títà àti owó.',
        'landing.journey.step2Title': 'Ṣàyẹ̀wò mítà rẹ',
        'landing.journey.step2Body': 'A máa ṣàyẹ̀wò mítà àti ibùdó ṣáájú rírà.',
        'landing.journey.step3Title': 'Pa àkọsílẹ̀ rẹ mọ́',
        'landing.journey.step3Body': 'Tọ́kìn, risiti, àti ìtàn dúró lẹ́yìn ìdúnàádúrà.',
    },
    ha: {
        'common.language': 'Harshe',
        'common.chooseLanguage': 'Zaɓi harshe',
        'common.getStarted': 'Fara amfani',
        'common.signIn': 'Shiga',
        'common.signOut': 'Fita',
        'common.dashboard': 'Babban allo',
        'common.wallet': 'Walati',
        'common.buyToken': 'Sayi token',
        'common.meters': 'Mitoci',
        'common.receipts': 'Rasitoci',
        'common.notifications': 'Sanarwa',
        'common.profile': 'Bayanan mutum',
        'common.security': 'Tsaro',
        'common.help': 'Taimako',
        'common.settings': 'Saituna',
        'common.search': 'Bincika',
        'common.openMenu': 'Buɗe menu',
        'common.closeMenu': 'Rufe menu',
        'landing.nav.how': 'Yadda yake aiki',
        'landing.nav.features': 'Abubuwan amfani',
        'landing.nav.portals': 'Mashigai',
        'landing.nav.faq': 'Tambayoyi',
        'landing.hero.eyebrow': 'Yana aiki a wuraren da ake tallafawa',
        'landing.hero.titlePrimary': 'Wutar lantarki mai wayo,',
        'landing.hero.titleAccent': 'tare.',
        'landing.hero.subtitle': 'Sayi wuta. Duba amfani. Ajiye rasitoci.',
        'landing.hero.customerCta': 'Fara a matsayin abokin ciniki',
        'landing.hero.vendorCta': 'Buɗe mashigar dillali',
        'landing.hero.trustOne': 'Babu kuɗin farawa',
        'landing.hero.trustTwo': 'Ana fara duba mita',
        'landing.hero.trustThree': 'Ana ajiye rasitoci',
        'landing.demo.balance': 'Kuɗin da ake da shi',
        'landing.demo.live': 'Yana aiki',
        'landing.demo.funded': 'An saka kuɗi a walati',
        'landing.demo.tokenReady': 'Token ya shirya',
        'landing.demo.paymentConfirmed': 'An tabbatar da biya',
        'landing.demo.copyToken': 'Kwafi token',
        'landing.demo.copied': 'An kwafi token',
        'landing.demo.receiptSaved': 'An ajiye rasit',
        'landing.demo.connectedMeter': 'Mita da aka haɗa',
        'landing.demo.consumption': 'Amfani da wuta',
        'landing.demo.hourly': 'Kowane awa',
        'landing.demo.daily': 'Kullum',
        'landing.demo.liveKw': 'kW kai tsaye',
        'landing.demo.peakLoad': 'Mafi girman nauyi 3.2 kW',
        'landing.demo.averageDaily': 'Matsakaici 13.7 kWh kullum',
        'landing.demo.threePhase': 'Fas uku yana aiki',
        'landing.coverage.eyebrow': 'Wuraren aiki',
        'landing.coverage.title': 'Walati ɗaya. Duk wuraren da ake tallafawa.',
        'landing.coverage.subtitle': 'Bayanan wurare suna fitowa daga kundin tashoshin Beverly kai tsaye.',
        'landing.coverage.mapLabel': 'Taswirar Najeriya mai nuna jihohin tashoshin Beverly',
        'landing.coverage.mapSource': 'Bayanan iyaka:',
        'landing.coverage.liveDirectory': 'Kundin tashoshin aiki',
        'landing.coverage.siteCount': 'Wurare {count} suna aiki',
        'landing.coverage.stateCount': 'Wurare {count}',
        'landing.coverage.locationPending': 'Ana jiran wurin',
        'landing.coverage.error': 'Bayanan wuraren aiki ba su samuwa yanzu.',
        'landing.coverage.retry': 'Sake gwadawa',
        'landing.coverage.footnote': 'Sabbin tashoshi za su bayyana bayan kunna su.',
        'landing.coverage.cta': 'Duba mitarka',
        'landing.journey.eyebrow': 'An gina shi don ayyuka na gaske',
        'landing.journey.title': 'Tafiya ɗaya mai sauƙi, daga mita zuwa rasit.',
        'landing.journey.subtitle': 'Kowane mataki yana bayyane kuma ana iya komawa gare shi.',
        'landing.journey.step1Title': 'Zaɓi mashigarka',
        'landing.journey.step1Body': 'Abokan ciniki suna sayen wuta. Dillalai suna kula da sayarwa da kuɗi.',
        'landing.journey.step2Title': 'Tabbatar da mitarka',
        'landing.journey.step2Body': 'Ana duba mita da tasha kafin saye.',
        'landing.journey.step3Title': 'Ajiye bayananka',
        'landing.journey.step3Body': 'Ana ajiye token, rasit, da tarihin ciniki.',
    },
    ig: {
        'common.language': 'Asụsụ',
        'common.chooseLanguage': 'Họrọ asụsụ',
        'common.getStarted': 'Malite',
        'common.signIn': 'Banye',
        'common.signOut': 'Pụọ',
        'common.dashboard': 'Dashboard',
        'common.wallet': 'Akpa ego',
        'common.buyToken': 'Zụta token',
        'common.meters': 'Mita',
        'common.receipts': 'Akwụkwọ nnata',
        'common.notifications': 'Ọkwa',
        'common.profile': 'Profaịlụ',
        'common.security': 'Nchekwa',
        'common.help': 'Enyemaka',
        'common.settings': 'Ntọala',
        'common.search': 'Chọọ',
        'common.openMenu': 'Mepee menu',
        'common.closeMenu': 'Mechie menu',
        'landing.nav.how': 'Otu o si arụ ọrụ',
        'landing.nav.features': 'Uru ndị dị',
        'landing.nav.portals': 'Ọnụ ụzọ',
        'landing.nav.faq': 'Ajụjụ',
        'landing.hero.eyebrow': 'Na-arụ ọrụ n’ebe akwadoro',
        'landing.hero.titlePrimary': 'Ike eletrik amamihe,',
        'landing.hero.titleAccent': 'ọnụ.',
        'landing.hero.subtitle': 'Zụta ọkụ. Lelee ojiji. Chekwaa akwụkwọ nnata.',
        'landing.hero.customerCta': 'Malite dịka onye ahịa',
        'landing.hero.vendorCta': 'Mepee ọnụ ụzọ onye na-ere',
        'landing.hero.trustOne': 'Enweghị ụgwọ mmalite',
        'landing.hero.trustTwo': 'A na-ebu ụzọ nyochaa mita',
        'landing.hero.trustThree': 'A na-echekwa akwụkwọ nnata',
        'landing.demo.balance': 'Ego dị',
        'landing.demo.live': 'Na-arụ ọrụ',
        'landing.demo.funded': 'Etinyela ego n’akpa',
        'landing.demo.tokenReady': 'Token adịla njikere',
        'landing.demo.paymentConfirmed': 'Ekwenyela ịkwụ ụgwọ',
        'landing.demo.copyToken': 'Detuo token',
        'landing.demo.copied': 'E detuola token',
        'landing.demo.receiptSaved': 'Echekwara akwụkwọ nnata',
        'landing.demo.connectedMeter': 'Mita ejikọrọ',
        'landing.demo.consumption': 'Ojiji ọkụ',
        'landing.demo.hourly': 'Kwa elekere',
        'landing.demo.daily': 'Kwa ụbọchị',
        'landing.demo.liveKw': 'kW ugbu a',
        'landing.demo.peakLoad': 'Ibu kacha elu 3.2 kW',
        'landing.demo.averageDaily': 'Nkezi 13.7 kWh kwa ụbọchị',
        'landing.demo.threePhase': 'Ụzọ atọ na-arụ ọrụ',
        'landing.coverage.eyebrow': 'Ebe ọrụ dị',
        'landing.coverage.title': 'Otu akpa ego. Ebe niile akwadoro.',
        'landing.coverage.subtitle': 'Ebe ọrụ na-esite ozugbo na ndekọ ọdụ Beverly.',
        'landing.coverage.mapLabel': 'Maapụ Naịjirịa na-egosi steeti ọdụ Beverly',
        'landing.coverage.mapSource': 'Isi data okeala:',
        'landing.coverage.liveDirectory': 'Ndekọ ọdụ na-arụ ọrụ',
        'landing.coverage.siteCount': 'Ebe {count} na-arụ ọrụ',
        'landing.coverage.stateCount': 'Ebe {count}',
        'landing.coverage.locationPending': 'A na-eche ọnọdụ',
        'landing.coverage.error': 'Ndekọ ebe ọrụ adịghị ugbu a.',
        'landing.coverage.retry': 'Gbalịa ọzọ',
        'landing.coverage.footnote': 'Ọdụ ọhụrụ ga-apụta mgbe arụnyere ha.',
        'landing.coverage.cta': 'Lelee mita gị',
        'landing.journey.eyebrow': 'E wuru ya maka ọrụ ndị mmadụ',
        'landing.journey.title': 'Otu njem doro anya, site na mita ruo nnata.',
        'landing.journey.subtitle': 'Nzọụkwụ ọ bụla doro anya ma dị mfe ilegharị.',
        'landing.journey.step1Title': 'Họrọ ọnụ ụzọ gị',
        'landing.journey.step1Body': 'Ndị ahịa na-azụta ọkụ. Ndị na-ere na-elekọta ire na ego.',
        'landing.journey.step2Title': 'Nyochaa mita gị',
        'landing.journey.step2Body': 'A na-enyocha mita na ọdụ tupu ịzụta.',
        'landing.journey.step3Title': 'Chekwaa ndekọ gị',
        'landing.journey.step3Body': 'A na-echekwa token, nnata, na akụkọ azụmahịa.',
    },
};

for (const locale of Object.keys(LANDING_MESSAGES)) {
    Object.assign(messages[locale], LANDING_MESSAGES[locale]);
}

const localeState = ref('en');

export function resolveLocale(input) {
    const normalized = String(input || '').trim().toLowerCase().replace('_', '-').split('-')[0];
    return SUPPORTED_LOCALES.some(({ code }) => code === normalized) ? normalized : 'en';
}

export function getLocale() {
    return localeState.value;
}

export function getIntlLocale(locale = localeState.value) {
    return SUPPORTED_LOCALES.find(({ code }) => code === resolveLocale(locale))?.intl || 'en-NG';
}

export function translate(key, params = {}, locale = localeState.value) {
    const selected = resolveLocale(locale);
    const template = messages[selected]?.[key] ?? messages.en[key] ?? key;
    return Object.entries(params).reduce(
        (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
        template,
    );
}

export function setLocale(locale, options = {}) {
    const next = resolveLocale(locale);
    localeState.value = next;
    if (typeof document !== 'undefined') document.documentElement.lang = getIntlLocale(next);
    if (options.persist !== false && typeof localStorage !== 'undefined') {
        try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* storage remains optional */ }
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('beverly:locale-changed', { detail: { locale: next } }));
    }
    return next;
}

export function initLocale() {
    let saved = '';
    try { saved = localStorage.getItem(LOCALE_STORAGE_KEY) || ''; } catch { /* storage remains optional */ }
    const browserLocale = typeof navigator !== 'undefined' ? navigator.languages?.[0] || navigator.language : '';
    return setLocale(saved || browserLocale || 'en', { persist: Boolean(saved) });
}

export function useI18n() {
    return {
        locale: readonly(localeState),
        locales: SUPPORTED_LOCALES,
        t: (key, params = {}) => translate(key, params, localeState.value),
        setLocale,
        getIntlLocale,
    };
}

export function formatLocalizedNumber(value, options = {}) {
    return new Intl.NumberFormat(getIntlLocale(), options).format(value);
}

export function formatLocalizedCurrency(amount, currency = 'NGN') {
    return new Intl.NumberFormat(getIntlLocale(), { style: 'currency', currency }).format(amount);
}

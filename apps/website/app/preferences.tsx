"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Language = "en" | "km";
type Theme = "dark" | "light";

const km: Record<string, string> = {
  "nav.product": "ផលិតផល", "nav.download": "ទាញយក", "nav.changelog": "កំណត់ហេតុ", "nav.docs": "ឯកសារ",
  "nav.language": "ភាសាខ្មែរ", "nav.theme.light": "ប្រើផ្ទៃភ្លឺ", "nav.theme.dark": "ប្រើផ្ទៃងងឹត",
  "home.badge": "FORGE BETA អាចប្រើបានហើយ", "home.title.1": "កន្លែងដែលគំនិតក្លាយជា", "home.title.2": "កម្មវិធីដែលដំណើរការ។",
  "home.lead": "កន្លែងធ្វើការតែមួយសម្រាប់ AI agent កូដ browser terminal និង Git របស់អ្នក។ ពីសំណើដំបូងរហូតដល់លទ្ធផលដែលបានផ្ទៀងផ្ទាត់ ដោយមិនបាត់បង់បរិបទ។",
  "home.downloadWindows": "ទាញយកសម្រាប់ Windows", "home.downloadStatus": "មើលស្ថានភាពទាញយក", "home.readDocs": "អានឯកសារ",
  "home.freeBeta": "Beta ឥតគិតថ្លៃ", "home.windows": "Windows 10+", "home.loop": "វដ្តការងារតែមួយ។ មានគ្រប់ឧបករណ៍ដែលអ្នកត្រូវការ។",
  "home.ask": "សួរ", "home.code": "សរសេរកូដ", "home.run": "ដំណើរការ", "home.see": "មើល", "home.inspect": "ពិនិត្យ", "home.fix": "កែ", "home.verify": "ផ្ទៀងផ្ទាត់",
  "cap.kicker": "បង្កើតសម្រាប់វដ្តការងារទាំងមូល", "cap.title.1": "ប្តូរបរិបទតិច។", "cap.title.2": "បញ្ចប់ការងារបានច្រើន។",
  "cap.lead": "Forge ផ្តល់ឧបករណ៍ឱ្យ agent របស់អ្នកយល់ពីគម្រោង កែប្រែបានត្រឹមត្រូវ និងបញ្ជាក់ថាវាដំណើរការ។",
  "cap.1.title": "Agent ជាចំណុចកណ្តាល", "cap.1.copy": "ប្រើ Grok បានឥឡូវនេះ ខណៈការគាំទ្រ Codex និង Claude ត្រូវបានរៀបចំរួចក្នុង workspace។",
  "cap.2.title": "កូដជាមួយបរិបទ", "cap.2.copy": "Project explorer និង editor ពិតប្រាកដធ្វើឱ្យរាល់ការកែប្រែមើលឃើញ ពិនិត្យបាន និងភ្ជាប់នឹង codebase។",
  "cap.3.title": "ដំណើរការការងារ", "cap.3.copy": "Agent អាច install, build, test និង debug តាម terminal ដែលរួមបញ្ចូល ដោយស្ថិតក្រោមការគ្រប់គ្រងរបស់អ្នក។",
  "cap.4.title": "មើលលទ្ធផល", "cap.4.copy": "បើកកម្មវិធី local ក្នុង browser ផ្ទាល់ ពិនិត្យ interface និងបិទវដ្ត feedback។",
  "cap.5.title": "ពិនិត្យឱ្យច្បាស់", "cap.5.copy": "អាន DOM ផ្ទាល់ ស្វែងរកបញ្ហារូបរាង និងកំណត់ element ដែលត្រូវកែពិតប្រាកដ។",
  "cap.6.title": "បញ្ជូនដោយទំនុកចិត្ត", "cap.6.copy": "ពិនិត្យ diff តាមដានការងារ និង commit លទ្ធផលដែលបានផ្ទៀងផ្ទាត់ ដោយមិនចាកចេញពី workspace។",
  "agent.kicker": "នាំយក AGENT របស់អ្នក", "agent.title.1": "Model របស់អ្នក។", "agent.title.2": "កន្លែងធ្វើការល្អជាងមុន។",
  "agent.lead": "Forge ជាកន្លែងដែល agent ទទួលបានដៃ៖ ចូលដំណើរការគម្រោង ឧបករណ៍ feedback និងប្រវត្តិច្បាស់លាស់នៃអ្វីដែលបានកើតឡើង។",
  "agent.setup": "មើលការដំឡើង agent", "agent.available": "អាចប្រើបានឥឡូវ", "agent.soon": "មកដល់ឆាប់ៗ",
  "browser.kicker": "BROWSER WORKSPACE", "browser.title.1": "បង្កើតវា។", "browser.title.2": "បន្ទាប់មកមើលវា។",
  "browser.lead": "Forge រកឃើញ local development server ហើយបើកវាជាប់នឹងកូដ។ Agent អាចពិនិត្យអ្វីដែលបាន render មិនមែនតែអ្វីដែល compile ទេ។",
  "browser.1": "រកឃើញ localhost ដោយស្វ័យប្រវត្តិ", "browser.2": "Browser tabs នៅក្នុងកម្មវិធី", "browser.3": "ពិនិត្យ DOM និង UI",
  "cta.kicker": "ចាប់ផ្តើមជាមួយ FORGE", "cta.title.1": "បម្លែងគំនិតបន្ទាប់របស់អ្នក", "cta.title.2": "ទៅជាកម្មវិធីដែលដំណើរការ។",
  "cta.lead": "Forge Beta សម្រាប់ Windows អាចទាញយកបានហើយ។ macOS និង Linux នឹងមកដល់បន្ទាប់។", "cta.download": "ទាញយក Forge",
  "download.kicker": "ទាញយក", "download.title": "Forge សម្រាប់កុំព្យូទ័ររបស់អ្នក។", "download.lead": "ដំឡើង beta ចុងក្រោយ ហើយដាក់ agent កូដ browser និងឧបករណ៍របស់អ្នកក្នុង workspace តែមួយ។",
  "download.recommended": "សមស្របសម្រាប់ឧបករណ៍នេះ", "download.button": "ទាញយក", "download.soon": "មកដល់ឆាប់ៗ",
  "download.confidence": "ដំឡើងដោយទំនុកចិត្ត", "download.confidenceCopy": "Forge សុំការអនុញ្ញាតមុនពេលដំណើរការសកម្មភាពកែប្រែ និងបំបែក desktop runtime ពី interface។",
  "download.get": "អ្វីដែលអ្នកទទួលបាន", "download.getCopy": "កម្មវិធីដំឡើង Windows ស្តង់ដារ ជាមួយ Forge desktop app ពេញលេញ។ Beta មិនតម្រូវឱ្យមានគណនីទេ។",
  "changelog.kicker": "កំណត់ហេតុ", "changelog.title": "អ្វីដែលយើងកំពុងបង្កើត។", "changelog.lead": "សមត្ថភាពថ្មី workflow កាន់តែប្រសើរ និងការកែបញ្ហានៅរាល់កំណែ Forge។",
  "changelog.new": "ថ្មី", "changelog.improved": "បានកែលម្អ", "changelog.fixed": "បានកែបញ្ហា",
  "docs.kicker": "ឯកសារ", "docs.title": "ចាប់ផ្តើមបង្កើតជាមួយ Forge។", "docs.lead": "មគ្គុទ្ទេសក៍ខ្លីពីការដំឡើងរហូតដល់ការកែប្រែដែលបានផ្ទៀងផ្ទាត់។",
  "docs.1.title": "ចាប់ផ្តើម", "docs.1.body": "ដំឡើង Forge បន្ថែម xAI API key ក្នុង Settings ហើយបើកថតគម្រោងដែលអ្នកចង់ធ្វើការ។",
  "docs.2.title": "បើកគម្រោង", "docs.2.body": "ជ្រើស Open a folder ពី welcome screen។ Forge រក្សាគម្រោងថ្មីៗឱ្យនៅជិត និងស្តារ workspace ពេលអ្នកប្តូរគម្រោង។",
  "docs.3.title": "ភ្ជាប់ AI agent", "docs.3.body": "Beta គាំទ្រ Grok តាម xAI API key។ ព័ត៌មានសម្ងាត់នៅក្នុង desktop runtime ហើយមិនត្រូវបង្ហាញទៅ renderer ទេ។",
  "docs.4.title": "ប្រើ workspace", "docs.4.body": "សួរក្នុង chat តាមដាន tool activity ពិនិត្យកូដក្នុង editor ដំណើរការ command ក្នុង terminal និងមើល local app ក្នុង browser។",
  "docs.5.title": "Browser និង inspector", "docs.5.body": "ពេល Forge រកឃើញ local development URL សូមបើកវាក្នុង browser pane ហើយប្រើ inspector ដើម្បីផ្តល់ UI context ច្បាស់លាស់ដល់ agent។",
  "docs.6.title": "ដោះស្រាយបញ្ហា", "docs.6.body": "បើ agent មិនភ្ជាប់ សូមពិនិត្យ API key និង model ក្នុង Settings។ បើ project tool បរាជ័យ សូមពិនិត្យ activity detail ហើយព្យាយាមម្តងទៀត។",
  "legal.kicker": "ច្បាប់", "legal.privacy": "គោលការណ៍ឯកជនភាព", "legal.terms": "លក្ខខណ្ឌប្រើប្រាស់", "legal.updated": "កែប្រែចុងក្រោយ 13 សីហា 2026 · Forge public beta",
  "legal.store.title": "អ្វីដែល Forge រក្សាទុក", "legal.store.body": "Forge រក្សាទុក settings គម្រោងថ្មីៗ និងស្ថានភាព workspace នៅលើឧបករណ៍របស់អ្នក។ API keys ត្រូវបានគ្រប់គ្រងដោយ desktop runtime និងមិនមាននៅក្នុង website ទេ។",
  "legal.project.title": "ទិន្នន័យគម្រោងរបស់អ្នក", "legal.project.body": "Forge ចូលប្រើតែថតដែលអ្នកជ្រើស។ ពេលប្រើ AI provider prompts និង project context ដែលពាក់ព័ន្ធអាចត្រូវផ្ញើទៅ provider តាមលក្ខខណ្ឌ និងគោលការណ៍របស់ពួកគេ។",
  "legal.website.title": "ទិន្នន័យ website", "legal.website.body": "Website នេះមិនតម្រូវឱ្យមានគណនី និងមិនប្រើ advertising cookies ទេ។ Hosting logs មូលដ្ឋានអាចត្រូវបានប្រើសម្រាប់សុវត្ថិភាព និងភាពទុកចិត្ត។",
  "legal.choices.title": "ជម្រើសរបស់អ្នក", "legal.choices.body": "អ្នកអាចលុបទិន្នន័យ Forge ក្នុងម៉ាស៊ីនដោយ uninstall app និងលុប application-data folder។ អ្នកអាចដក provider keys ចេញពី dashboard របស់ provider បានគ្រប់ពេល។",
  "legal.beta.title": "កម្មវិធី Beta", "legal.beta.body": "Forge កំពុងស្ថិតក្នុង beta។ មុខងារអាចផ្លាស់ប្តូរ និងអាចមានកំហុស។ សូមរក្សា backup និងពិនិត្យការកែប្រែមុន commit។",
  "legal.responsibility.title": "ទំនួលខុសត្រូវរបស់អ្នក", "legal.responsibility.body": "អ្នកទទួលខុសត្រូវលើគម្រោង command credentials និងសេវាភាគីទីបីដែលភ្ជាប់នឹង Forge។ សូមពិនិត្យ permissions មុនអនុញ្ញាតសកម្មភាពកែប្រែ។",
  "legal.third.title": "សេវាភាគីទីបី", "legal.third.body": "AI providers repositories និងឧបករណ៍ភ្ជាប់ផ្សេងៗស្ថិតក្រោមលក្ខខណ្ឌរបស់ពួកគេ។ Forge មិនគ្រប់គ្រងសេវាទាំងនោះទេ។",
  "legal.availability.title": "ភាពអាចប្រើបាន", "legal.availability.body": "Beta ផ្តល់ជូនតាមស្ថានភាពបច្ចុប្បន្ន ខណៈយើងកែលម្អភាពទុកចិត្ត និងការចែកចាយ។ យើងអាច update ផ្អាក ឬបញ្ឈប់មុខងារ beta។",
  "legal.note": "គោលការណ៍ beta ជាភាសាសាមញ្ញនេះជាសេចក្តីជូនដំណឹងដំបូង ហើយគួរត្រូវបានពិនិត្យដោយអ្នកប្រឹក្សាច្បាប់មុនចែកចាយពាណិជ្ជកម្មទូលំទូលាយ។",
  "footer.tagline": "AI desktop តែមួយសម្រាប់ការងាររបស់អ្នក។", "footer.product": "ផលិតផល", "footer.capabilities": "សមត្ថភាព", "footer.learn": "ស្វែងយល់", "footer.documentation": "ឯកសារ", "footer.agents": "Agents", "footer.troubleshooting": "ដោះស្រាយបញ្ហា", "footer.legal": "ច្បាប់", "footer.privacy": "ឯកជនភាព", "footer.terms": "លក្ខខណ្ឌ", "footer.beta": "Public beta",
};

type PreferenceContextValue = {
  language: Language;
  theme: Theme;
  t: (key: string, fallback?: string) => string;
  toggleLanguage: () => void;
  toggleTheme: () => void;
};

const PreferenceContext = createContext<PreferenceContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const savedLanguage = localStorage.getItem("forge-language");
      const savedTheme = localStorage.getItem("forge-theme");
      const nextLanguage = savedLanguage === "km" ? "km" : "en";
      const nextTheme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      document.documentElement.lang = nextLanguage;
      document.documentElement.dataset.theme = nextTheme;
      setLanguage(nextLanguage);
      setTheme(nextTheme);
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  const value = useMemo<PreferenceContextValue>(() => ({
    language,
    theme,
    t: (key, fallback = key) => language === "km" ? (km[key] ?? fallback) : fallback,
    toggleLanguage: () => setLanguage((current) => {
      const next = current === "en" ? "km" : "en";
      document.documentElement.lang = next;
      localStorage.setItem("forge-language", next);
      return next;
    }),
    toggleTheme: () => setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("forge-theme", next);
      return next;
    }),
  }), [language, theme]);

  return <PreferenceContext.Provider value={value}>{children}</PreferenceContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferenceContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}

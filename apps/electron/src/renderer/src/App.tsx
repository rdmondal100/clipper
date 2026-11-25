import { LANGUAGE_CODES, LANGUAGES } from "@shared/languages";
import { useAppInfo } from "./hooks/useAppInfo";
import { strings } from "./lib/strings";

// M0 placeholder: proves IPC works and that Bangla/Hindi render in the UI font (SPEC-001 R17)
function App() {
  const info = useAppInfo();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">{strings.appName}</h1>
        <p className="text-muted-foreground">{strings.tagline}</p>
      </div>

      <section aria-label={strings.languagesHeading} className="flex gap-3">
        {LANGUAGE_CODES.map((code) => (
          <span key={code} lang={code} className="rounded-lg border px-4 py-2 text-xl">
            {LANGUAGES[code].nativeName}
          </span>
        ))}
      </section>

      <p className="text-sm text-muted-foreground">
        {info ? `${strings.version} ${info.version}${info.isDev ? ` · ${strings.devMode}` : ""}` : "…"}
      </p>
      <p className="max-w-md text-xs text-muted-foreground">{strings.milestone}</p>
    </main>
  );
}

export { App };

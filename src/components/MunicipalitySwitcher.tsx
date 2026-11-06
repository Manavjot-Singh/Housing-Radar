import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLang } from "@/lib/i18n";

const TOOL = "http://127.0.0.1:8770";

/**
 * Developer tool: search any German municipality and rebuild the dashboard for it. The local tool
 * behind it runs scripts on this machine, so the button appears only on a dev server opened from
 * this machine. Lovable's preview is a dev server too, but the tool can never be reached from it.
 */
export function MunicipalitySwitcher({ className }: { className?: string }) {
  const [lang] = useLang();
  const en = lang === "en";
  const [local, setLocal] = useState(false);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<boolean | null>(null);

  useEffect(() => setLocal(["localhost", "127.0.0.1"].includes(window.location.hostname)), []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const probe = () => fetch(TOOL, { mode: "no-cors" }).then(() => alive && setRunning(true), () => alive && setRunning(false));
    void probe();
    const timer = setInterval(() => void probe(), 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [open]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === TOOL && e.data === "city-installed") window.location.reload();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!local) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={className}>{en ? "Change municipality" : "Gemeinde wechseln"}</button>
      </DialogTrigger>
      <DialogContent className="z-[2000] flex h-[85vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>{en ? "Change municipality" : "Gemeinde wechseln"}</DialogTitle>
          <DialogDescription>
            {en ? "Search any municipality in Germany, review its datasets and load it into the dashboard." : "Suche eine beliebige Gemeinde in Deutschland, prüfe ihre Datensätze und lade sie ins Dashboard."}
          </DialogDescription>
        </DialogHeader>
        {running ? (
          <iframe src={`${TOOL}/?embed=1`} title={en ? "Municipality search" : "Gemeindesuche"} className="min-h-0 w-full flex-1 rounded-md border" />
        ) : running === false ? (
          <div className="text-sm">
            <p>{en ? "The data tool is not running. It normally starts with the dev server. It needs Python; start it by hand with:" : "Das Datenwerkzeug läuft nicht. Normalerweise startet es mit dem Dev-Server. Es braucht Python; von Hand startest du es so:"}</p>
            <pre className="mt-2 rounded-sm bg-muted p-2 font-mono text-xs">python scripts/dataset_wizard.py</pre>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

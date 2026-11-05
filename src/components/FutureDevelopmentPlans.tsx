import { FutureDevelopmentMap } from "@/components/FutureDevelopmentMap";
import { useLang } from "@/lib/i18n";

export function FutureDevelopmentPlans() {
  const [lang] = useLang();
  const en = lang === "en";
  return (
    <section className="mt-10 rounded-md border bg-card p-4 sm:p-6" aria-labelledby="future-development-title">
      <p className="kicker">{en ? "Long-term planning" : "Langfristige Planung"}</p>
      <h2 id="future-development-title" className="mt-1 text-3xl font-bold uppercase">
        {en ? "Future Development Plans" : "Future Development Plans · Zukünftige Entwicklung"}
      </h2>
      <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
        {en
          ? "This screening map combines high housing pressure (under 50 m² per resident and vacancy at or below 11%) with low building coverage (10% or less). Nature-reserve polygons are subtracted from the highlighted review zones and are not shown here."
          : "Die Karte kombiniert hohen Wohnungsdruck (unter 50 m² je Einwohner und höchstens 11 % Leerstand) mit geringer Gebäudegrundfläche (höchstens 10 %). Naturschutzgebiete sind von den hervorgehobenen Prüfzonen abgezogen und werden hier nicht angezeigt."}
      </p>
      <div className="mt-4 overflow-hidden rounded-md border">
        <FutureDevelopmentMap lang={lang} />
      </div>
      <p className="mt-3 border-l-2 border-primary bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {en
          ? "Highlighted districts: Bockelsberg and Weststadt. These are broad search zones, not confirmed buildable plots: low building coverage can include parks, roads, water or private land. The map subtracts mapped nature reserves only; it does not yet screen zoning, Natura 2000, landscape protection, flood risk, ownership or infrastructure. Confirm each site in the Geoportal and the binding plans before proposing construction. Reserve boundaries were clipped to the dashboard's OSM district outline."
          : "Hervorgehoben: Bockelsberg und Weststadt. Das sind grobe Suchräume, keine bestätigten Baugrundstücke: geringe Gebäudegrundfläche kann auch Parks, Straßen, Gewässer oder Privatflächen umfassen. Abgezogen sind nur die erfassten Naturschutzgebiete; Bauleitplanung, Natura 2000, Landschaftsschutz, Hochwasser, Eigentum und Infrastruktur sind noch nicht geprüft. Jeden Standort vor einem Bauvorschlag im Geoportal und anhand der verbindlichen Pläne kontrollieren. Die Schutzgebiete wurden an der OSM-basierten Stadtteilgrenze des Dashboards zugeschnitten."}
      </p>
    </section>
  );
}

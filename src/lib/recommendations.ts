// Rule-based "what the city can do" ideas, driven by whatever figures exist for a place.
// Each district is compared with the city, so ideas change whenever the place changes.

export type Profile = {
  wohnflaecheProKopf?: number | null;
  leerstandsquote?: number | null;
  /** Share of older residents in % (65+). */
  anteilAelter?: number | null;
  efhAnteil?: number | null;
  raeumeProKopf?: number | null;
  versorgung?: number | null;
  gewerbeLeerstand?: number | null;
  einwohnerJeGebaeude?: number | null;
};

export type Idea = { id: string; de: { title: string; text: string }; en: { title: string; text: string } };

const above = (v: number | null | undefined, ref: number | null | undefined, f = 1.1) => v != null && ref != null && v >= ref * f;
const below = (v: number | null | undefined, ref: number | null | undefined, f = 0.9) => v != null && ref != null && v <= ref * f;

export function recommend(p: Profile, ref: Profile): Idea[] {
  const out: Idea[] = [];
  const olderMany = above(p.anteilAelter, ref.anteilAelter);
  const spacious = above(p.wohnflaecheProKopf, ref.wohnflaecheProKopf) || above(p.raeumeProKopf, ref.raeumeProKopf);
  const houses = above(p.efhAnteil, ref.efhAnteil);
  const vacant = above(p.leerstandsquote, ref.leerstandsquote, 1.2);

  if (olderMany && (spacious || houses)) out.push({
    id: "wohnenFuerHilfe",
    de: { title: "Wohnen für Hilfe", text: "Ältere Menschen mit großen Häusern vermieten ein Zimmer günstig an Studierende oder Auszubildende, die dafür im Haushalt oder Garten helfen. Die Stadt vermittelt, z. B. zusammen mit der Leuphana und dem Studierendenwerk." },
    en: { title: "Homeshare (housing for help)", text: "Older people with large houses rent a room cheaply to students or trainees, who help in the house or garden in return. The city brokers matches, e.g. together with the university and student services." },
  });
  if (olderMany && houses) out.push({
    id: "umzugsBoerse",
    de: { title: "Wohnungstausch & Umzugshilfe", text: "Eine Tauschbörse, über die ältere Haushalte in kleinere, barrierefreie Wohnungen im selben Viertel wechseln – mit Umzugsprämie und Hilfe beim Umzug. Das große Haus wird für Familien frei." },
    en: { title: "Home swap & moving support", text: "A swap scheme letting older households move to smaller, step-free flats in the same area – with a moving bonus and practical help. The large house becomes free for families." },
  });
  if (houses && spacious) out.push({
    id: "einliegerwohnung",
    de: { title: "Einliegerwohnungen fördern", text: "Beratung und Zuschüsse, um Einfamilienhäuser in zwei Wohnungen zu teilen oder Dachgeschosse auszubauen. Schnelle Baugenehmigung für solche Umbauten." },
    en: { title: "Support granny flats", text: "Advice and grants for splitting detached houses into two flats or converting attics, plus fast-track permits for such conversions." },
  });
  if (vacant) out.push({
    id: "leerstandAktivieren",
    de: { title: "Leerstand aktivieren", text: "Eigentümer leerer Wohnungen gezielt ansprechen, Sanierungsberatung anbieten und Mietgarantien über die Stadt (z. B. „Sozialagentur Wohnen“) vermitteln." },
    en: { title: "Bring empty flats back", text: "Contact owners of empty flats directly, offer renovation advice and city-backed rent guarantees (social letting agency)." },
  });
  if (vacant && below(p.versorgung, ref.versorgung)) out.push({
    id: "versorgung",
    de: { title: "Nahversorgung stärken", text: "Wo Wohnungen leer stehen und Läden, Ärzte oder Haltestellen fehlen: Busanbindung verbessern, Dorfladen oder mobile Praxis unterstützen, damit die Lage wieder gefragt ist." },
    en: { title: "Improve local amenities", text: "Where flats stand empty and shops, doctors or stops are missing: better bus links, support for a community shop or mobile practice so the area is in demand again." },
  });
  if (p.gewerbeLeerstand != null && p.gewerbeLeerstand > 0) out.push({
    id: "gewerbe",
    de: { title: "Leere Läden öffnen", text: "Leere Ladenflächen für Community-Projekte und Zwischennutzungen öffnen oder in Wohnungen umbauen – das belebt die Straße und macht die Wohnungen darüber attraktiver." },
    en: { title: "Open up empty shops", text: "Open empty shop units for community projects and pop-ups, or convert them into flats – this revives the street and makes the flats above more attractive." },
  });
  if (below(p.wohnflaecheProKopf, ref.wohnflaecheProKopf) && !vacant) out.push({
    id: "knapp",
    de: { title: "Knappen Wohnraum schützen", text: "Hier ist Wohnraum schon dicht genutzt: Zweckentfremdung (z. B. Ferienwohnungen) begrenzen, Aufstockungen und Dachausbau erleichtern, geförderte Wohnungen sichern." },
    en: { title: "Protect scarce housing", text: "Living space is already used densely here: restrict misuse (e.g. holiday lets), ease adding storeys and attic conversions, secure subsidised flats." },
  });
  if (olderMany) out.push({
    id: "gemeinschaft",
    de: { title: "Gemeinschaftliches Wohnen im Alter", text: "Wohnprojekte und Senioren-WGs im Quartier unterstützen (Grundstücke, Beratung), damit Ältere im Viertel bleiben können und große Wohnungen frei werden." },
    en: { title: "Shared living in old age", text: "Support co-housing and senior flat-shares in the neighbourhood (land, advice) so older people can stay local while large homes become available." },
  });
  if (!out.length) out.push({
    id: "beobachten",
    de: { title: "Weiter beobachten", text: "Die Werte liegen nahe am Vergleichswert. Nach der nächsten Datenlieferung erneut prüfen und Bestand erhalten." },
    en: { title: "Keep monitoring", text: "Figures are close to the reference. Re-check after the next data release and maintain existing housing." },
  });
  return out;
}

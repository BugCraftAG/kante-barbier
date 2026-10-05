# KANTE – Barbier in Graz (Demo)

Website für einen **fiktiven** Barbershop mit echter Online-Terminbuchung – ohne Framework, ohne Abhängigkeiten, ohne Backend.

**Live:** https://bugcraftag.github.io/kante-barbier/

Drittes Projekt in meinem Portfolio, nach dem [Wirtshaus Rebenhof](https://bugcraftag.github.io/REST-DEMO-WEB/) und der [Tischlerei Kogler](https://bugcraftag.github.io/tischlerei-demo/).

## Funktionen

- **Terminbuchung in fünf Schritten:** Leistung → Barbier (oder „egal wer“) → Tag → Uhrzeit → Daten. Es werden nur Zeiten angeboten, die wirklich frei sind.
- **Live-Infos im Kopfbereich:** nächster freier Termin, geschätzte Wartezeit ohne Termin, offen/geschlossen – alles nach Wiener Zeit, minütlich aktualisiert.
- **Kalender-Export:** Nach der Buchung lässt sich der Termin als `.ics` in Apple-, Google- oder Outlook-Kalender übernehmen.
- **Teilbare Links:** Der Buchungszustand steht in der URL, z. B. `?leistung=fade&bei=lena&tag=2026-10-07&zeit=14:30`.
- **Barrierefrei:** alle Auswahlen sind echte Radio-Buttons (Pfeiltasten, Screenreader), sichtbarer Fokus, `prefers-reduced-motion`. axe-core meldet 0 Verstöße.
- **Datenschutz:** keine Cookies, kein Tracking, keine externen Anfragen. Schriften sind selbst gehostet.

## Wie die Terminplanung funktioniert

Die freie Zeit eines Barbiers an einem Tag ist eine Mengendifferenz von Intervallen:

```
frei = Schicht − Pausen − gebuchte Termine − (heute: alles vor jetzt + 30 min)
```

Aus den freien Intervallen werden alle Startzeiten im 15-Minuten-Raster berechnet, an denen die Dauer der Leistung vollständig hineinpasst (`fitSlots`). Bei „egal wer“ werden die Zeiten aller passenden Barbiere vereinigt; gebucht wird beim Barbier mit der geringsten Tagesauslastung.

Weil es kein Backend gibt, werden bestehende Buchungen **deterministisch** aus einem Seed (Barbier + Datum, FNV-1a-Hash → Mulberry32-PRNG) erzeugt. Dadurch sieht jeder Besucher dieselbe Auslastung, und das Verhalten ist reproduzierbar testbar. Für einen echten Betrieb würde man nur `simulatedBookings()` durch einen API-Aufruf ersetzen.

## Aufbau

```
index.html          Seite (Inhalte, die nicht aus Daten entstehen)
impressum.html      Impressum & Datenschutz
css/style.css       Design-Tokens und Komponenten in Cascade Layers
js/
  data.js           Leistungen, Team, Arbeitszeiten, Regeln – einzige Datenquelle
  time.js           Datum/Uhrzeit in Europe/Vienna, unabhängig vom Gerät
  schedule.js       Intervall-Arithmetik, Slot-Berechnung, Scheduler (reine Funktionen)
  booking.js        Buchungsablauf: Zustand → Rendering, URL-Synchronisation
  ics.js            iCalendar-Export nach RFC 5545
  html.js           Template-Helfer mit automatischem Escaping (XSS-sicher)
  fade.js           Das Halbton-Signet im Kopfbereich (Canvas)
  app.js            Einstiegspunkt
tests/              Unit-Tests mit dem eingebauten Node-Test-Runner
fonts/              Instrument Serif, Geist, Geist Mono (SIL OFL 1.1)
```

## Lokal starten und testen

```bash
npm start      # lokaler Server auf http://localhost:8080 (ES-Module brauchen http://)
npm test       # 19 Tests, keine Abhängigkeiten, Node 22+
```

Ein GitHub-Actions-Workflow (`.github/workflows/test.yml`) führt dieselben Tests in der Cloud aus.

## Lizenz

Code: MIT. Schriften: SIL Open Font License 1.1 (siehe `fonts/`).

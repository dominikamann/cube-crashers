# Cube Crashers – Grafik, Farbwahl, Stufe 2 und Stufe 3 (Design v4)

Stand: 2026-11-11 · baut auf Design v2 (Tower Run) und v3 (LAN, Jetpack, seltene Waffen, Schwierigkeit) auf.

Auftrag **[Dominik]**: „Zieh das bitte alles durch … und die Grafik optimieren, so dass es noch ansprechender
ist. Mach's perfekt.“ Umfang: Grafik-Option und schönere Grafik, eigene Farbe, Stufe 2 (5 Stockwerke, Themen,
Schachtfahrt, Aufzug-Shop, Bosse), Stufe 3 (Freischaltungen, Walze und Hoverboard, Endlos-Modus).
Nicht in diesem Schritt: deutsche Übersetzung, signierte Installer, OpenStreetMap, Plugins.

Alle Einzelentscheidungen unten sind **Builder-Entscheidungen** im Sinne des Auftrags; sie folgen dem, was in
Design v2/v3 schon als Vision beschrieben und angenommen wurde.

## 1. Grafik

**Qualitätsstufe** in den Einstellungen: Niedrig, Mittel, Hoch (Standard), Ultra.

| | Niedrig | Mittel | Hoch | Ultra |
|---|---|---|---|---|
| Pixeldichte | 1 | bis 1,5 | bis 2 | volle Bildschirmdichte (bis 3) |
| Schatten | aus | 1024 | 2048 | 4096, weicher |
| Kantenglättung | aus | 4× | 4× | 4× |
| Bloom | aus | an | an | an |
| Umgebungsverdeckung (SSAO) | – | – | – | an |
| Vignette und Farbabstimmung | – | an | an | an |
| Partikel | ½ | voll | voll | voll |

**Schöner, auf jeder Stufe:**
- **Gebackene Umgebungsverdeckung:** Bodenkacheln neben Wänden werden dunkler, Wände bekommen hellere Oberkanten.
  Gibt Tiefe ohne Rechenkosten.
- **Himmel:** Farbverlauf statt einer flachen Hintergrundfarbe; Licht mit warmer Hauptquelle und kühler Aufhellung.
- **Deko:** Laternen, Pflanzenkübel, alte Automaten und Kisten auf freien Bodenflächen abseits der Wege
  (nicht im Weg, rein optisch), passend zum Stockwerk-Thema.
- **Treffer-Feedback:** Gegner blitzen beim Treffer kurz weiß auf; schwebende Schadenszahlen (abschaltbar).
- **Staub- und Glitzerpartikel** in der Luft, je nach Thema.
- Die Lesbarkeits-Regel aus Design v1 bleibt: Effekte dürfen nie das Spielgeschehen verschmieren.

## 2. Eigene Farbe

In den Einstellungen wählt man eine der 6 Anzugfarben (oder „automatisch“). Allein gilt sie immer. Im LAN
schickt der Client seine Wunschfarbe mit; ist sie vergeben, bekommt er die nächste freie.

## 3. Stufe 2 – ein Run über 5 Stockwerke

| Stockwerk | Thema | Art | Besonderheit |
|---|---|---|---|
| 1 | Arcade Plaza | Nester | die bestehende Karte, Tag |
| 2 | Candy Factory | Nester | Förderbänder (schieben Spieler und Gegner), pastellige Farben |
| 3 | Mega Block Arena | Boss | runde Arena mit Säulen |
| 4 | Neon City | Nester | Straßenraster, dauerhaft Nacht-Look, mehr Elites |
| 5 | Rooftop | Boss | Dach mit Glitch-Rand, Segment Worm |

- **Zwischen den Stockwerken: Schachtfahrt (~45 s).** Die Spieler stehen auf einer runden Aufzugsplattform
  (eigene kleine Karte), fliegende **Glitch-Schwärmer** greifen von allen Seiten an; Zielen und Schießen wie
  sonst. Danach hält der Aufzug.
- **Aufzug-Shop (nach der Schachtfahrt, 25 s oder bis alle bereit sind):** jeder Spieler sieht 4 Angebote und
  kauft mit Münzen: Waffen-Stufe, Perk, volle Heilung, +1 Credit fürs Team (teuer, einmal pro Shop).
- **Bosse:**
  - **Mega Block** (Stockwerk 3): riesiger Panzerblock, 3 Phasen; angekündigte Stampfer (Bodenringe),
    Schockwellen in Linien, ruft Verstärkung. Besiegt → Aufzug öffnet.
  - **Segment Worm** (Stockwerk 5): aus dem ersten Prototyp zurückgeholt; Segmente, Teilung in der Mitte
    (min. 3 Segmente, max. 4 Würmer), angekündigte Einschläge, greift Türme an.
  - Boss-Stockwerke haben keine Nester; der Alarm steigt dort nicht.
- Was mitgeht: Waffen, Perks, Münzen, Credits. Was zurückgesetzt wird: Alarm, Türme, Karts, Gegner.
- **Sieg:** Segment Worm besiegt und den letzten Aufzug betreten. Punkte-Bonus pro Stockwerk.
- **Einzelnes Stockwerk** bleibt als Schnellstart wählbar („Quick floor“); Standard ist der volle Run.

## 4. Stufe 3

- **Freischaltungen:** Nach jedem Run gibt es **Tickets** (aus Punkten, Stockwerken und Schwierigkeit). Im Menü
  „Unlocks“ kauft man damit: die Waffen Joystick Boomerang, Disco Ball, Banana Mine, Party Bomb (am Anfang
  gesperrt; die anderen vier sind frei), die Fahrzeuge Walze und Hoverboard, und den Endlos-Modus.
  Gesperrtes taucht nicht in Kisten bzw. auf der Karte auf. Fortschritt lokal gespeichert. Im LAN zählt, was
  irgendein Spieler in der Lobby freigeschaltet hat.
- **Walze:** langsam (0,7× Kart), sehr robust (250), zermalmt alles (80 Schaden), springt nicht über Rampen.
- **Hoverboard:** schnell (1,3× Kart), schwebt über Glitch-Boden und niedrige Mauern, rammt nicht, wenig robust (60).
- **Endlos-Modus:** Arcade Plaza ohne Ende: Zerstörte Nester kommen nach 60 s an anderer Stelle wieder, der
  Alarm steigt weiter (über 5 hinaus wird es nur noch schneller), Ziel ist die höchste Punktzahl. Eigene Bestenliste.

## 5. Technik

- `SimState` bekommt `run: { mode: 'run' | 'quick' | 'endless'; floor: number; stage: 'floor' | 'shaft' | 'shop' }`.
  Jedes Stockwerk ist ein `FloorDef` (Karte, Thema, Art, Boss); Stockwerkwechsel baut die Karte neu auf und
  behält Spieler-Fortschritt. Der Renderer baut die Welt neu, wenn sich die Karte ändert.
- Schnappschüsse im LAN enthalten Stockwerk und Phase; Clients laden die Karte nach Id.
- Neue Befehle: `buy`, `ready` (Shop). Neue Felder werden geprüft wie alle Befehle.
- Freischaltungen werden beim Join in `hello` mitgeschickt.

## 6. Reihenfolge

1. Grafik-Qualität und Optik-Upgrade, Farbwahl.
2. Stockwerk-System mit Run-Ablauf, Candy Factory und Neon City, Aufzug-Shop.
3. Schachtfahrt.
4. Bosse (Mega Block, Segment Worm) mit ihren Arenen.
5. Freischaltungen, Walze, Hoverboard, Endlos-Modus.
6. Balancing mit dem Bot, Doku, GIF, Release.

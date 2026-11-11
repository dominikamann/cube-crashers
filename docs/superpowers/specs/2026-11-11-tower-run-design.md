# Cube Crashers – Tower Run (Design v2)

Stand: 2026-11-11 · ersetzt den Lane-Modus aus `2026-11-11-cube-crashers-design.md` als Kern des Spiels.
Was dort zu Look, Sound, Plattform, Open Source, Sprache und LAN steht, gilt weiter.

Markierungen: **[Dominik]** = vom Auftraggeber gesagt. **[Vorschlag, angenommen]** = im Gespräch vorgeschlagen
und von Dominik mit „go for it“ angenommen. **[Builder-Entscheidung]** = beim Aufschreiben festgelegt, nicht
einzeln besprochen. **[offen für Builder]** = darf beim Bauen frei entschieden werden.

## 1. Warum der Umbau

Dominik hat Phase 1 durchgespielt und sich dabei kaum bewegt. Sein Urteil **[Dominik]**:

1. Der Spaßfaktor fehlt.
2. Die Map ist lahm.
3. Es gibt keine mehreren Level.
4. Die Action fehlt.

Ursache im alten Design: Alles kam zum Spieler (Kisten, Münzen), Waffen trafen von überall, kein Gegner
meinte den Spieler, die Map war eine gerade Bahn. Ein stillstehender Spieler konnte gewinnen.

**Auftrag [Dominik]:** „Mach das Spiel so, dass ich süchtig werde und es gerne meinen Kumpels auf der LAN
vorstelle und wir es dann zocken.“ Gewünschte Zutaten: ein Mix mit Jump-'n'-Run- und Kart-Elementen
(Fahrzeug nehmen und über die Pixel-Gegner fahren), große Maps mit unterschiedlichen Horden und
Verzweigungen, Horden dürfen frei herumlaufen, Stockwerke, eine klare Antwort auf „Was ist das Ziel, wann
verliert man?“ (z. B. Anstürme auf den Spieler und nur x Leben).

## 2. Das Spiel in einem Absatz

Ihr kämpft euch einen Turm hoch, Stockwerk für Stockwerk. Jedes Stockwerk ist eine große Voxel-Karte mit
Abzweigungen, auf der Horden frei herumstreifen. Die Horden kommen aus **Glitch-Nestern**. Um ein Nest zu
zerstören, legt ihr eine Ladung und haltet die Stelle, während ein Ansturm kommt – dafür baut ihr Türme.
Sind alle Nester weg, öffnet sich der Aufzug. Ihr habt **3 Credits**; sind sie aufgebraucht, ist der Run
vorbei. Ein steigender **Alarm-Pegel** bestraft Trödeln. **[Vorschlag, angenommen]**

## 3. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**
- Der Spieler ist die ganze Zeit in Bewegung und trifft ständig kleine Entscheidungen.
- Jeder Run läuft anders; man will „noch einen“.
- Taugt als LAN-Party-Spiel: sofort verständlich, laut, chaotisch, mit Rangliste am Ende.
- Weiterverwenden, was da ist: Waffen, Türme, Gegner, Bosse, Renderer, Sound, i18n, Sim/Render-Trennung.

**Nicht-Ziele (vorerst)**
- Echte übereinanderliegende Ebenen innerhalb eines Stockwerks (Brücken über begehbaren Wegen).
  „Stockwerke“ sind aufeinanderfolgende Karten; innerhalb einer Karte gibt es Rampen und Sprünge.
- Prozedural generierte Karten. Karten sind handgebaut, die Besetzung wird pro Run gewürfelt.
- Online-Multiplayer, Map-Editor, OpenStreetMap-Import, Plugins (bleiben in `docs/ideas.md`).

**Anti-Ziele**
- **Stillstehen darf nie die beste Strategie sein.** Messbar über das Run-Log (§11).
- Unlesbares Chaos: Auch mit 200 Gegnern muss man Bedrohungen (Schüsse, Rammer, Bomber) erkennen können.
  Es gilt weiter: Effekte dürfen nichts verschmieren.
- Das Spiel pausiert nicht für Bauen oder Karten-Auswahl.
- Geschützte Figuren, Namen, Items oder Level anderer Spiele. Fahrzeuge, Springen und Item-Felder sind
  Genre-Mechaniken und werden mit eigenen Figuren und eigenem Aussehen umgesetzt.
  **Folge [Builder-Entscheidung]:** Die orange „?“-Kiste bekommt ein eigenes Aussehen (Münzautomaten-Truhe
  mit Pfeil-/Stern-Symbol), weil sie einem bekannten Fragezeichen-Block zu ähnlich sieht.
- Frust durch unfaire Tode: Jeder gefährliche Angriff kündigt sich an.

## 4. Ein Run

### Ziel und Verlieren **[Vorschlag, angenommen]**
- **Stockwerk geschafft:** alle Nester des Stockwerks zerstört und den Aufzug betreten.
- **Run gewonnen:** letztes Stockwerk geschafft (in Stufe 1: das eine Stockwerk).
- **Credits:** 3 pro Run, im Team geteilt. Geht ein Spieler zu Boden, kostet das 1 Credit; nach 3 s steht er
  am letzten sicheren Punkt (Startpunkt oder zuletzt zerstörtes Nest) wieder auf, 2 s unverwundbar, verliert
  25 % seiner Münzen, behält Waffen. **Fällt der Zähler auf 0, ist der Run verloren.**
- **Alarm-Pegel 0–5:** steigt alle 60 s um 1. Pro Stufe: Horden +20 % größer, Nester spawnen schneller,
  Gegner +5 % schneller. Bei 5 („Overload“) jagen pausenlos Anstürme den Spieler. Ein zerstörtes Nest senkt
  den Pegel um 1. **[Builder-Entscheidung: Zahlen]**
- Zielzeit pro Stockwerk: 4–6 Minuten.

### Ablauf auf einem Stockwerk
1. Start am Aufzug. Minimap zeigt Nester, Fahrzeuge, Power-ups, Aufzug.
2. Horden streifen umher. Wer in ihre Nähe kommt, wird gejagt.
3. Nest erreichen → **E halten (1 s)** legt die Ladung → **25 s halten:** Solange ein Spieler im Umkreis
   von 6 Feldern steht, läuft der Zähler vorwärts und alle ~5 s kommt ein **Ansturm von außen**: Er
   erscheint an einem der Ansturm-Eingänge des Nests (mindestens 10 Felder entfernt) und läuft durch die
   Zugänge auf das Nest zu. Genau dort liegen die 3–4 Bauplätze. Das Nest selbst spawnt während des Haltens
   nichts auf den Spieler. Danach explodiert das Nest: Würfel, Münzregen, eine Kiste, Alarm −1.
   **Verlässt der Spieler den Umkreis** (auch durch einen Sturz), läuft der Zähler mit halbem Tempo
   rückwärts bis höchstens 0 und es kommen keine neuen Anstürme. Die Ladung bleibt liegen und muss nie neu
   gelegt werden. Türme allein halten den Zähler nicht. **[Builder-Entscheidung]**
4. Unzerstörte Nester spawnen alle ~30 s eine neue Horde (begrenzt durch eine Obergrenze lebender Gegner).
5. Alle Nester weg → Aufzug öffnet sich (Leuchtsäule, Minimap) → hineinlaufen.

## 5. Der Spieler

**Steuerung [Builder-Entscheidung]**

| Taste | Aktion |
|---|---|
| WASD / Pfeile | Laufen (Fahrzeug: lenken/fahren) |
| Leertaste | Springen; Landung ist ein **Stampfer** |
| Shift | **Dash** |
| E | Interagieren: bauen (halten), Ladung legen (halten), Fahrzeug ein-/aussteigen (tippen) |
| 1–3 / Maus | Turm im Baumenü wählen |
| Esc / P | Pause |

- **Dash:** 4 Felder in 0,15 s, dabei unverwundbar, 10 Schaden an allem auf dem Weg, 1,2 s Abklingzeit.
- **Sprung:** ca. 0,5 s in der Luft, fliegt über Gegner und Bodengefahren (nicht über Wände). Landung:
  15 Flächenschaden im Radius 1,2 und kurzer Rückstoß. In der Luft trifft Kontaktschaden nicht.
- **Waffen** feuern weiter automatisch **[Dominik, Phase 1]**, aber: Reichweiten ca. −35 %, und Treffer
  innerhalb von 3 Feldern machen +50 % Schaden. Nähe lohnt sich.
- **Combo:** Jeder Kill erhöht die Combo; sie verfällt 3 s nach dem letzten Kill oder Münz-Pickup.
  Multiplikator = 1 + ⌊Combo/10⌋, höchstens ×10. Er gilt für Münzwert und Punkte. Groß und laut im HUD.
- **Münzen** verfallen nach 8 s (blinken die letzten 3 s). Kein automatisches Heranfliegen mehr; der
  Magnet-Radius von 2,5 bleibt.
- **Kisten** öffnen sich zu **drei schwebenden Karten** nebeneinander. Hineinlaufen wählt; die anderen
  verschwinden. Die Auswahl bleibt 15 s liegen. Karten: neue Waffe, Waffen-Stufe, oder ein **Perk**.
  Kisten kommen von Elite-Gegnern, zerstörten Nestern und festen Fundorten.
- **Perks (Stufe 1, je bis 3× stapelbar) [offen für Builder: Werte]:** schneller laufen, zweite
  Dash-Ladung, größerer Magnet, mehr Münzwert, Lebens-Regeneration, größerer Stampfer.

## 6. Gegner und Horden

Bestehende Typen bleiben (Hop Blob, Armor Block, Splitter). Der Dasher wird zum Jäger. Neu sind Gegner, die
den Spieler meinen **[Vorschlag, angenommen; Werte = Builder-Entscheidung]**:

| Typ | Verhalten | Ankündigung |
|---|---|---|
| **Jäger** | schnell, verfolgt den Spieler direkt | – |
| **Schütze** | hält 7 Felder Abstand, feuert langsame Kugeln (6 Felder/s, 10 Schaden) | blitzt vor dem Schuss |
| **Bomber** | rennt zum Spieler, zündet, explodiert nach 0,6 s (Radius 2, 25 Schaden, trifft auch Gegner und Türme) | blinkt, Ring am Boden |
| **Rammer** | nimmt 0,8 s Anlauf, stürmt geradeaus (30 Schaden), nach Wandtreffer 1,5 s benommen | Linie am Boden |
| **Elite** | jede Art in groß und leuchtend, 5× Leben, lässt eine Kiste fallen | Leuchten |

- **Horden:** Gruppen von 8–25 Gegnern mit je eigener Mischung (z. B. „Blob-Schwarm“, „Jäger-Rudel“,
  „Schützen mit Schild-Blöcken“). Sie wandern zwischen Wegpunkten. Bemerken sie einen Spieler (Radius ~10),
  jagt die ganze Horde ihn.
- **Wegfindung:** Die Karte ist ein Kachelraster; Gegner folgen einem Flussfeld zum nächsten Spieler, das
  regelmäßig neu berechnet wird. **[offen für Builder: Details]**
- Zielgröße: 200+ Gegner gleichzeitig bei 60 FPS auf guter Hardware.

## 7. Karten

- **Kachelkarte**, als Text-Raster in `src/sim/config/` definiert (ein Zeichen = ein Feld). Das hält Karten
  datengetrieben und passt zu den Plugin-/OSM-Ideen. Stufe-1-Karte: ca. 70 × 70 Felder.
- Felder: Boden, **Wand** (für alle unpassierbar, stoppt Schüsse), **niedrige Mauer** (für Läufer und Gegner
  unpassierbar, Schüsse und Fahrzeuge in der Luft kommen darüber), **Glitch-Boden** (begehbar, aber
  10 Schaden pro Sekunde zu Fuß; Sprung und Fahrzeug überqueren ihn schadlos; Gegner meiden ihn),
  **Boost-Feld** (Tempo ×1,6 für 2 s, zu Fuß und im Fahrzeug), **Rampe** (schleudert Fahrzeuge 0,8 s durch
  die Luft, über niedrige Mauern und Glitch-Boden; Landung = Flächenschaden), Bauplatz, Kandidaten für
  Nest / Ansturm-Eingang / Fahrzeug / Power-up / Kiste, Wegpunkte für Horden, Startpunkt, Aufzug.
- **Kein Abgrund, kein Tod durch Herunterfallen** – das wäre mit Dash, Rückstoß und Abwurf unfair.
  **[Builder-Entscheidung]**
- **Jeder Run anders:** Die Karte enthält mehr Kandidaten als genutzt werden. Der Seed wählt z. B. 4 von
  7 Nest-Plätzen, dazu Fahrzeuge, Kisten, Horden-Mischungen.
- Layout-Regeln: mehrere Wege zu jedem Nest, Engstellen an Nest-Zugängen (für Türme), mindestens eine
  Rundstrecke mit Boost-Feldern und Rampen fürs Fahrzeug, offene Plätze für große Kämpfe, Sackgassen mit
  Belohnung. Die Kamera folgt dem Spieler im bisherigen Winkel.
- **Power-ups** erscheinen alle ~30 s an einem zufälligen Kandidaten, bleiben 15 s, mit Ansage und
  Minimap-Markierung: Magnet (alle Münzen fliegen 8 s zu dir), Dauerfeuer (×2 Feuerrate, 8 s), Bombe
  (räumt Radius 8), Frost (alle Gegner 5 s langsam), Herz (+50 Leben).
- **Themen der Stockwerke (Vision):** 1 Arcade Plaza (Tag) · 2 Candy Factory (Förderbänder) ·
  3 Arena: Mega Block · 4 Neon City (Nacht-Look A2) · 5 Rooftop: Segment Worm.

## 8. Fahrzeuge **[Dominik: Fahrzeug nehmen und über die Pixel fahren]**

- **Crash Kart (Stufe 1):** Mit E einsteigen. Doppelt so schnell wie zu Fuß. Steuerung wie beim Laufen:
  Das Kart fährt in die gedrückte Richtung (bezogen auf den Bildschirm), mit etwas Trägheit beim
  Beschleunigen und Wenden. **[Builder-Entscheidung]**
  Rammen macht 40 Schaden und schleudert Gegner weg. Waffen feuern weiter. Der Fahrer nimmt keinen
  Kontaktschaden; Schüsse, Explosionen und Rammen kosten **Haltbarkeit** (100; kleiner Gegner −2, Armor
  Block −10). Sprit für 20 s Fahrt. Leer oder kaputt → Kart zerplatzt in Würfel, Fahrer wird abgeworfen.
- Karts stehen an Fahrzeug-Plätzen und erscheinen 45 s nach Verlust neu.
- Später: Walze (langsam, zermalmt alles), Hoverboard (schnell, kein Rammschaden), Mitfahrer im LAN.

## 9. Türme

Die drei Türme und das Baumenü bleiben. Bauplätze liegen an Nest-Zugängen und Engstellen. Türme sind das
Werkzeug fürs Halten; Bomber und Rammer beschädigen sie. Kosten dürfen sinken, weil Münzen jetzt verfallen.
**[offen für Builder: Balancing]**

## 10. Was Spieler zurückholt (Stufen 2–3)

- **Run über 5 Stockwerke** (~20 Minuten), Bosse auf 3 und 5 als Arena-Stockwerke.
- **Schacht-Fahrt zwischen den Stockwerken [Dominik: begeistert von einer Fahrt-Sequenz in einem anderen
  Spiel, bei der man im fahrenden Gefährt Schwärme abschießt]:** Der Aufzug ist eine offene Plattform, die
  ~45 s von selbst durch den Schacht fährt, während fliegende Glitch-Schwärme angreifen. Hier zielt der
  Spieler ausnahmsweise selbst mit der Maus. Eigene Umsetzung, keine Kopie eines fremden Levels.
- **Aufzug-Shop** zwischen Stockwerken: Münzen ausgeben für 1 von 3 Angeboten (Perk, Waffen-Stufe,
  Heilung, Extra-Credit).
- **Punkte und Bestenliste** lokal, pro Run mit Aufschlüsselung (Kills, höchste Combo, Zeit, Credits übrig).
- **Dauerhafte Freischaltungen** über Tickets aus Run-Punkten: Waffen, Fahrzeuge, Türme, Figuren, Themen.
- **Endlos-Modus** pro Stockwerk.
- **LAN (eigene Phase, Vorgaben aus Design v1 bleiben):** bis 6 Spieler, geteilte Credits, gestürzte
  Mitspieler lassen sich 8 s lang ohne Credit-Verlust aufheben, Horden skalieren mit Spielerzahl, am Ende
  eine Rangliste „Wer hat die meisten Würfel gecrasht“.

## 11. Run-Log **[Builder-Entscheidung]**

Dominik bat darum, „in die Logs zu schauen“ – es gab keine. Ab jetzt schreibt jeder Run ein kleines
JSON-Protokoll: pro 10 s zurückgelegte Strecke, Zeit im Stillstand, Kills nach Quelle (Waffe, Turm,
Fahrzeug, Stampfer, Dash), höchste Combo, Schaden genommen, Stürze, Alarm-Pegel, dazu Ergebnis und Dauer.

- Im Dev-Server landet es als Datei in `logs/` im Projekt (nicht eingecheckt), in der Desktop-App im
  Benutzerdaten-Ordner. Nichts wird ins Netz geschickt.
- Kennzahl für das Anti-Ziel: Anteil der Zeit im Stillstand soll bei einem normalen Run unter 20 % liegen.

## 12. Bau-Reihenfolge

Spaß lässt sich nur durch Spielen prüfen. Deshalb in Stufen, nach jeder spielt Dominik:

**Stufe 1 – ein Stockwerk, voller Action-Kern (das wird jetzt geplant und gebaut)**
- Kachelkarte „Arcade Plaza“ mit Kollision, mitlaufender Kamera, Minimap.
- Sprung/Stampfer, Dash, Combo, verfallende Münzen, Nah-Bonus, gekürzte Reichweiten.
- Herumstreifende Horden mit Flussfeld; Jäger, Schütze, Bomber, Rammer, Elite.
- Nester mit Ladung-legen-und-halten, Alarm-Pegel, Credits, Aufzug.
- Bauplätze um die Nester, bestehende drei Türme.
- Kisten mit Drei-Karten-Wahl, 6 Perks, neues Kisten-Aussehen.
- Crash Kart mit Boost-Feldern und Rampen; 5 Power-ups.
- Punkte, lokale Bestenliste, Sieg-/Niederlage-Bildschirm mit Aufschlüsselung; Run-Log.
- Sounds für alles Neue (weiter im Code erzeugt); HUD: Credits, Alarm, Combo, Nester, Dash-/Sprit-Anzeige.
- Der Lane-Modus (Wellen, Basis-Automat, alte Map) wird entfernt; er bleibt in der Git-Historie und kann
  später als eigener Modus zurückkommen. **[Builder-Entscheidung]**
- Mini-Boss und Segment Worm werden in Stufe 1 ebenfalls entfernt und in Stufe 2 aus der Git-Historie für
  Arena-Stockwerke neu aufgebaut. Nacht-Look und Boss-Musik bleiben und werden in Stufe 1 für den
  Alarm-Pegel 5 („Overload“) genutzt. **[Builder-Entscheidung]**

**Stufe 2:** 5-Stockwerke-Run, Aufzug-Shop, weitere Themen, Bosse als Arena-Stockwerke.
**Stufe 3:** Freischaltungen, weitere Fahrzeuge, Endlos-Modus. **Danach:** LAN.

## 13. Dem Builder überlassen

Alle Balancing-Zahlen, Karten-Layout im Rahmen der Regeln aus §7, Horden-Mischungen, Perk-Werte,
Minimap-Gestaltung, Aussehen neuer Gegner, Fahrzeuge und Nester im bestehenden Voxel-Stil, neue Sounds,
Code-Struktur, Tests.

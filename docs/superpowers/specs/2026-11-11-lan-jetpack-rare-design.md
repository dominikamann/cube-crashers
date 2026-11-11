# Cube Crashers – LAN, Jetpack, seltene Waffen (Design v3)

Stand: 2026-11-11 · baut auf `2026-11-11-tower-run-design.md` (Stufe 1, fertig) auf.

Markierungen: **[Dominik]** = vom Auftraggeber gesagt. **[Vorschlag, angenommen]** = im Gespräch vorgeschlagen und
mit „sehr gut“ angenommen. **[Builder-Entscheidung]** = beim Aufschreiben festgelegt. **[offen für Builder]** = frei.

## 1. LAN-Koop

### Ziel **[Dominik, seit Design v1]**
Bis zu **6 Spieler** im lokalen Netz spielen zusammen einen Tower Run. So einfach wie möglich: **jede Installation
hat den Server eingebaut**, „Host game“ startet ihn, „Join“ zeigt gefundene Spiele automatisch als Liste, ein Klick
genügt, keine IP-Adresse.

### Ablauf **[Vorschlag, angenommen]**
- Titelbildschirm: **Play** (allein), **Host game**, **Join game**.
- **Host game:** Spielername eingeben (vorbelegt, gespeichert) → Lobby. Die App meldet das Spiel im LAN an.
- **Join game:** Liste der gefundenen Spiele („Dominiks Spiel (2/6)“), alle 1 s aktualisiert. Klick → Lobby.
  Notlösung, falls die Suche blockiert ist: Feld „Adresse“ (z. B. `192.168.1.20`). **[Builder-Entscheidung]**
- **Lobby:** Liste der Spieler mit Farbe; der Host startet. Volle Lobbys (6) und laufende Runden nehmen niemanden mehr auf.
- Verlässt ein Client die Runde, wird seine Figur entfernt. Verlässt der Host, endet die Runde für alle mit einer
  Meldung „Host hat das Spiel verlassen“.
- Nach der Runde: gemeinsamer Ergebnisbildschirm mit **Rangliste** (Würfel gecrasht, beste Combo, Aufgeholfen,
  Stürze) → zurück in die Lobby.

### Regeln im Mehrspieler **[Vorschlag, angenommen; Zahlen = Builder-Entscheidung]**
- **Credits gehören dem Team** (3 pro Run, wie allein).
- **Aufhelfen:** Wer mit Mitspielern spielt und auf 0 Leben fällt, liegt **8 s am Boden** (Markierung + Countdown
  über dem Kopf). Ein lebender Mitspieler, der 1,5 Felder nah steht und **E 1,5 s hält**, hilft ihm hoch: 50 % Leben,
  2 s unverwundbar, **kein Credit weg**. Läuft die Zeit ab, kostet es 1 Credit und er steht nach 3 s am sicheren Punkt
  wieder auf (wie allein). Liegen alle gleichzeitig am Boden, geht sofort ein Credit weg und alle stehen auf.
  Allein bleibt es wie bisher (sofort Credit weg).
- **Skalierung:** Horden-Größe und Anstürme × (1 + 0,35 · (Spieler − 1)); Feinde haben × (1 + 0,15 · (Spieler − 1)) Leben.
- Jeder hat eigene Waffen, Perks, Münzen, Combo; Punkte zählen fürs Team, die Rangliste zeigt die Anteile.
- Karten aus Kisten nimmt, wer hineinläuft. Der Aufzug: Ein Spieler im Aufzug reicht.
- Jeder Spieler hat eine eigene Anzugfarbe (6 Farben); die Minimap zeigt alle.

### Technik **[Builder-Entscheidung]**
- **Host-autoritativ:** Die Simulation läuft nur im Spiel des Hosts. Clients schicken jeden Tick ihre Eingaben
  (Bewegung, Zielpunkt, Tasten). Der Host schickt **30-mal pro Sekunde** einen kompakten Spielstand plus alle
  Ereignisse seit dem letzten Stand. Clients zeichnen den Stand (mit Glättung zwischen zwei Ständen) und spielen
  Sounds und Effekte aus den Ereignissen.
- **Server im Electron-Hauptprozess:** WebSocket-Server (`ws`-Paket) auf TCP-Port 47800, der nur weiterreicht
  (Client ↔ Host-Fenster über IPC). Anmeldung im LAN per **UDP-Broadcast** auf Port 47801 einmal pro Sekunde
  (`{ game, name, players, max, port, version }`); Join-Liste aus empfangenen Beacons, Einträge älter als 3 s fallen weg.
- **Browser/Dev-Server:** kann weder hosten noch suchen. Für Entwicklung und Tests gibt es einen **Dev-Relay** im
  Vite-Server (WebSocket unter `/__lan`), damit mehrere Browserfenster auf einem Rechner zusammen spielen können.
- **Protokoll:** JSON-Nachrichten mit Typ und Versionsnummer; ein Client mit anderer Version wird mit Meldung abgelehnt.
- Die Simulation selbst bleibt deterministisch und rein; Mehrspieler bedeutet dort nur: mehrere `Player`,
  Aufhelfen, Skalierung, Spieler hinzufügen/entfernen.
- Nur LAN. Keine Verschlüsselung, keine Accounts; Nachrichten werden auf Typ und Größe geprüft.

## 2. Jetpack **[Dominik: zum Finden, fliegt über Mauern, entlädt sich schnell]**
- Liegt als seltenes Fundstück auf der Karte: ein Jetpack beim Start an einem zufälligen Kisten-Platz, danach
  erscheint alle 90 s eines an einem freien Power-up-Platz (höchstens eines gleichzeitig pro Spieler auf der Karte).
  **[Builder-Entscheidung]**
- Aufheben durch Drüberlaufen. **Leertaste halten = fliegen** (statt springen), solange Sprit da ist.
- **Sprit: 5 s Flug**, dann ist das Jetpack verbraucht und fällt ab. Kein Nachladen.
- Im Flug: Höhe ~2,5, über Wände, niedrige Mauern, Glitch-Boden und Gegner hinweg; kein Kontaktschaden; Waffen
  funktionieren. Nicht aus der Karte hinaus (Außenrand).
- Loslassen → landet mit kleinem Stampfer. Läuft der Sprit über einer Wand aus, gleitet man zum nächsten freien Feld.
- Im Kart nicht nutzbar. Anzeige im HUD: Spritbalken.

## 3. Seltene Waffen **[Dominik: ganz selten aus Kisten, halten nur eine Weile (~60 s), kreativ]**
- Etwa **jede zehnte Kiste** enthält eine **goldene Karte** mit einer seltenen Waffe (sie ersetzt eine der drei Karten).
- Die seltene Waffe kommt in einen **eigenen Sonderplatz**, Taste **Q** wählt ihn; die 6 normalen Plätze bleiben.
  Sie hält **60 s** (Countdown im HUD), dann zerfällt sie in Würfel. Eine neue goldene Karte ersetzt eine noch aktive.
- Waffen (eigene Ideen, Werte = Builder-Entscheidung):
  - **Slush Machine:** sprüht dauerhaft (Taste halten) einen Kegel aus Eis-Slush (Reichweite 5). Gegner werden
    langsamer und nach 1 s im Strahl **eingefroren** (2 s regungslos, blau). Eingefrorene Gegner nehmen doppelten
    Schaden und zerspringen beim Tod in Eiswürfel.
  - **Bubblegum Bazooka:** Schuss in Zielrichtung; beim Aufprall eine große Kaugummiblase (Radius 2,5), die alle
    Gegner darin 3 s festklebt, dann platzt (Flächenschaden).
  - **Leaf Blower 3000:** dauerhafter Luftstoß (Kegel, Reichweite 6), schiebt Gegner kräftig weg; wer dabei gegen
    eine Wand knallt, nimmt Schaden. Bläst auch Münzen zu dir.
  - **Pizza Cutter:** wirft eine Sägescheibe, die bis zu 6-mal von Wänden abprallt und alles durchschneidet, 4 s lang.
- Seltene Waffen haben eigene Sounds und einen goldenen Glanz am Spieler.

## 4. Reihenfolge **[Builder-Entscheidung]**
1. Funde aus dem Review der Stufe 1 beheben.
2. Jetpack und seltene Waffen (Einzelspieler, sofort spielbar).
3. Mehrspieler in der Simulation (mehrere Spieler, Aufhelfen, Skalierung, Farben, Rangliste).
4. Netzwerk: Protokoll, Dev-Relay, Client/Host-Logik im Spiel, Lobby-Bildschirme.
5. Electron: WebSocket-Server, UDP-Anmeldung und Suche, IPC.
6. Doku, Installer.

## 5. Nicht-Ziele
Internet-Spiel, Accounts, Spielstände übers Netz, Sprach-Chat, Zuschauer, Anti-Cheat.

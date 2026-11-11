# Cube Crashers – Design

Stand: 2026-11-11 · Name: **Cube Crashers** **[Dominik]** (Alternative, ebenfalls gemocht: *Coin-Op Chaos* – z. B. als Name für einen Spielmodus nutzbar). Vor einer Veröffentlichung Namen auf bestehende Spiele/Marken prüfen.

Markierungen: **[Dominik]** = vom Auftraggeber entschieden. **[Builder-Entscheidung im Brainstorming]** = Vorschlag aus dem Gespräch, den der Auftraggeber ohne Widerspruch angenommen hat. **[offen für Builder]** = darf beim Bauen frei entschieden werden.

## 1. Worum es geht

Ein schnelles 3D-Actionspiel: Eine Flut von Retro-Arcade-Monstern rollt eine Lane herunter auf den Spieler zu, zwischendurch kommen Bosse. Der Spieler hält sie auf – mit selbst gesammelten, verrückten Waffen und mit Türmen, die er an den Rand baut. Eine Mischung aus Lane-/Horde-Shooter und Tower Defense, aber deutlich schneller als klassisches Tower Defense. **[Dominik]**

**Das Gefühl, um das es geht:** „Retro-Gegner mit cooler Technik verdreschen“ – inspiriert vom Film *Pixels* (Arcade-Figuren greifen an und zerplatzen in leuchtende Würfel). **[Dominik]**

**Warum:** Dominik hat kein Spiel gefunden, das dieses Genre als LAN-Koop für bis zu 6 Spieler anbietet. Ziel ist am Ende ein Spiel, das man mit Freunden im LAN zusammen meistert. Zuerst entsteht aber eine gute Einzelspieler-Version. **[Dominik]**

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**
- Schnelle, actionreiche Runden mit eskalierenden Wellen und harten, spektakulären Bossen.
- Läuft als installierbare Desktop-App auf **Windows und macOS**. **[Dominik]**
- Phase 1: Einzelspieler. Phase 2: LAN-Multiplayer bis 6 Spieler. **[Dominik]**
- Architektur der Phase 1 so, dass Phase 2 ohne Neuschreiben der Spiellogik möglich ist (siehe §8).

**Nicht-Ziele (vorerst)**
- Internet-/Online-Multiplayer, Matchmaking, Accounts.
- Mobile, Konsolen, Browser-Hosting als Produkt.
- Map-Editor.

**Anti-Ziele – das wäre ein Fehlschlag, selbst wenn es technisch funktioniert**
- **Unscharfe, verwaschene Optik.** Ein erster Entwurf mit starkem Bloom wurde abgelehnt („man erkennt kaum was“). Effekte dürfen nie die Lesbarkeit von Gegnern, Spieler, Türmen oder Boden beeinträchtigen. **[Dominik]**
- **Das Spiel stoppt zum Bauen.** Bauen passiert mitten in der Action. **[Dominik]**
- **Geschützte Figuren** (Pac-Man, Donkey Kong, Space-Invaders-Originale, Figuren aus *Pixels* usw.). Alle Gegner sind eigene Figuren *im Stil* alter Arcade-Spiele.
- **Kompliziertes LAN-Setup** – keine IP-Eingabe, kein separater Server, keine Konfiguration. **[Dominik]**

## 3. Look

**[Dominik]**, ausgewählt anhand live gerenderter Three.js-Entwürfe:

- **Grundlook „A1 – Tag mit Neon-Akzenten“:** Helle, bunte Voxel-Welt (alles aus Würfeln, Spielzeug-Diorama, weiche Schatten, Schachbrett-Kacheln). Neon-Leuchten **nur** für Action-Elemente: Projektile, Gegneraugen, Spieler-Visier, Turm-Laser, Boss-Aura, dünne Lane-Kanten.
- **Sonderlook „A2 – Nacht-Voxel“:** Dieselbe Welt in dunklem Blau (nicht schwarz), Lane-Kanten und Gegner glühen, Punktlichter an Spieler und Türmen. Wird für Bosskämpfe und Sonderlevel genutzt. **[Dominik: „für Sonderlevel“; Einsatz bei Bossen = Builder-Entscheidung im Brainstorming]**
- **Schärfe-Vorgaben** (aus der abgelehnten Version gelernt): Bloom nur dezent (hoher Schwellenwert, kleiner Radius), MSAA/Kantenglättung aktiv, Nacht-Look hell genug, dass Boden und Figuren klar lesbar sind. Referenzwerte aus dem akzeptierten Entwurf (Three.js `UnrealBloomPass`): Tag Stärke 0,25 / Radius 0,15 / Schwelle 0,95; Nacht 0,45 / 0,15 / 0,6; Render-Target mit 4× MSAA.
- **Münzen:** schön gepixelte Voxel-Münzen mit Glitzer. **[Dominik]**
- **Tod eines Gegners:** zerfällt in leuchtende Würfel; Boss zerfällt in hunderte Würfel, Münzregen.
- **Kamera:** schräg von oben auf die Lane, Spieler unten, Gegner kommen von oben (wie in den Entwürfen).
- Referenz-Entwurf: `docs/design/style-reference.html` (A1 links, A2 rechts; Fragment für die Brainstorming-Vorschau, Three.js-Teil läuft eigenständig).

### Sound & Musik **[Dominik: „geile Sounds, die passen, und Soundeffekte“]**
- Sound ist ein vollwertiger Teil des Spielgefühls, kein Nachgedanke: jeder Treffer, jede Münze, jeder Turm, jeder Boss-Auftritt braucht befriedigendes, druckvolles Feedback.
- Stil: moderner Chiptune/Retro-Arcade (8-/16-Bit-Klangfarben) mit etwas Punch und Tiefe, passend zu „Voxel mit Neon-Akzenten“.
- Weil das Projekt **Open Source** wird, dürfen nur Sounds mit kompatibler Lizenz rein. **[Builder-Entscheidung beim Aufschreiben]**: Soundeffekte werden **prozedural per Web Audio API synthetisiert** (sfxr-Prinzip: Oszillatoren, Hüllkurven, Pitch-Sweeps, Rauschen) und Musik als **im Code generierter Chiptune-Sequencer** – dadurch keine Lizenzfragen, winzige Dateigröße, leicht variierbar (z. B. leichte Tonhöhen-Variation pro Treffer gegen Monotonie).
- Mindestumfang Phase 1: Schuss-Sounds je Waffe, Treffer, Gegner-Zerplatzen, Münze einsammeln (ansteigende Tonhöhe bei Serien), Waffenkiste, Turm bauen, Turm feuert (je Typ), Basis getroffen, Spieler besiegt/Respawn, Welle startet, Boss-Warnsirene, Boss-Phasenwechsel, Boss-Tod (großer Würfel-Explosionssound), Sieg/Niederlage, Menü-Klicks.
- Musik: Menü-Track, Kampf-Track (Tag), intensiver Boss-Track (Nacht-Look). Lautstärke für Musik/Effekte getrennt einstellbar.
- Viele gleichzeitige Treffer dürfen nicht übersteuern: Limiter/Kompressor auf dem Master, Begrenzung gleichzeitiger gleicher Sounds.

## 4. Spielablauf

### Steuerung **[Builder-Entscheidung im Brainstorming]**
- **WASD** laufen. Der Spieler bewegt sich frei im unteren/mittleren Bereich der Map.
- **Waffen feuern automatisch** auf den nächsten Gegner in Reichweite (Survivors-Prinzip). Der Spieler konzentriert sich auf Laufen, Ausweichen, Einsammeln, Bauen. **[Dominik: „top Idee“]**
- **E** halten auf einem Bauplatz → kleines Auswahlmenü → **1–4** oder Mausklick wählt den Turm. Spiel läuft weiter.

### Eine Runde
- Zu Beginn läuft man in Position. **[Dominik]**
- Ca. **10 Wellen** pro Map; Welle 5 Mini-Boss, Welle 10 Endboss. Ca. 10–15 Minuten. Zwischen Wellen ca. 5 s Atempause. **[Builder-Entscheidung im Brainstorming]**
- **Basis:** Hinter dem Spieler steht ein alter Arcade-Automat. Jeder Gegner, der durchkommt, zieht Leben ab. Basis-Leben 0 → Runde verloren. Endboss besiegt → Runde gewonnen.
- **Spieler-Leben:** Wird der Spieler besiegt, steht er nach einigen Sekunden wieder auf und verliert einen Teil seiner Münzen. Waffen behält er.
- Nach der Runde gibt es 1–3 Sterne je nach verbleibendem Basis-Leben (in Phase 1 nur Anzeige, siehe §7).

### Waffen **[Dominik]**
- Waffen müssen keine klassischen Waffen sein – „vom Laserschwert über Smarties-Kanone bis Hotdog-Schleuder alles“.
- Waffen kommen aus **Waffenkisten**, die mit der Horde die Lane herunterkommen; man sammelt sie durch Drüberlaufen ein (oder schießt sie frei).
- Neue Waffen **kommen dazu** – man trägt mehrere gleichzeitig, alle feuern automatisch.
- Findet man eine Waffe, die man schon hat, steigt sie eine Stufe auf (stärker/schneller/mehr Projektile). **[Builder-Entscheidung beim Aufschreiben]** – folgt aus „dazukommen“, wurde nicht ausdrücklich besprochen. Maximal 6 gleichzeitige Waffen, Stufe max. 5. **[offen für Builder: genaue Zahlen]**

### Münzen & Budget **[Dominik]**
- Besiegte Gegner lassen Münzen fallen; das ist das Budget für Türme.
- Münzen werden im Umkreis automatisch eingesaugt (Magnet-Radius). **[offen für Builder]**

### Türme & Bauplätze **[Dominik, nach Vorschlag]**
- Jede Map hat **feste Bauplätze**: leuchtende Voxel-Plattformen an interessanten Stellen (Lane-Rand, Hügel, Engstellen, riskante Plätze weiter vorne). Ihre Lage gehört zum Map-Design.
- Begründung: schnelles Bauen ohne Zielen, jede Map bekommt Charakter und echte Entscheidungen, Gegner-Pfade bleiben frei, im LAN keine Konflikte.
- Später möglich (nicht Phase 1): Bauplatz-Upgrades, Spezialfelder.

### Gegner
- Eigene Retro-Arcade-Monster aus Voxeln, z. B. Blobs, Invasoren in Formation, Geister-Blobs. Sie laufen/hüpfen die Lane herunter auf die Basis zu.
- Große Mengen gleichzeitig (Horde-Gefühl: Dutzende bis über hundert Gegner auf dem Bildschirm).

### Bosse **[Dominik: „schwer und hammer krass“, „jedes Mal anders, Abwechslung“; Details = Builder-Entscheidung im Brainstorming, angenommen]**
Gemeinsame Regeln für alle Bosse:
- **Phasen** bei 66 % und 33 % Leben: neue Angriffe, ruft Verstärkung.
- **Angekündigte Angriffe:** Leuchtfeld am Boden blinkt vor dem Einschlag – schwer, aber fair.
- **Greift auch Türme an.**
- **Auftritt:** Wechsel in den Nacht-Look A2, Screen-Shake, Warnsirene.
- **Tod:** zerfällt in hunderte leuchtende Würfel, Münzregen.

Boss-Ideen (Reihenfolge der späteren Umsetzung offen):
1. **Segmentwurm** – Riesenraupe aus Segmenten; trifft man ein Mittelstück, teilt sie sich in zwei kleinere Würmer. **→ Endboss der ersten Version.**
2. **Formationsschiff** – Mutterschiff aus hunderten Mini-Invasoren, formt sich um (Wand, Pfeil, Faust), Laser-Regen.
3. **Labyrinth-Geist** – zieht leuchtende Mauern über die Lane, jagt den Spieler durchs entstehende Labyrinth.
4. **Klotz-Golem** – wirft riesige Blockformen, die als Hindernisse liegen bleiben, bis man sie zerschießt.

## 5. Erster spielbarer Umfang (Phase 1) **[Builder-Entscheidung im Brainstorming, angenommen]**

- **1 Map** im Look A1 (Wechsel zu A2 beim Endboss), mit 6–8 Bauplätzen.
- **6 Waffen** (Namen im Spiel auf Englisch, z. B. Pixel Blaster, Laser Sword, Candy Cannon, Hotdog Slinger, Joystick Boomerang, Disco Ball). Drei hat Dominik genannt, drei sind Vorschläge **[offen für Builder: Ausgestaltung und Balancing]**:
  1. *Pixel-Blaster* – Startwaffe, gerade Schüsse.
  2. *Laserschwert* – Nahkampf-Schwung rund um den Spieler. **[Dominik]**
  3. *Smarties-Kanone* – Streuschuss aus bunten Kugeln. **[Dominik]** Im Spiel als *Candy Cannon*, da „Smarties“ eine geschützte Marke ist. **[Builder-Entscheidung beim Aufschreiben]**
  4. *Hotdog-Schleuder* – Bogenwurf, Senf-Pfütze verursacht Flächenschaden. **[Dominik]**
  5. *Joystick-Bumerang* – fliegt raus und zurück, durchschlägt Gegner.
  6. *Disco-Kugel* – kreist um den Spieler, schießt Lichtstrahlen.
- **3 Turm-Typen** (Vorschlag): Laser-Turm (Einzelziel, schnell), Popcorn-Mörser (Flächenschaden), Frost-Automat (verlangsamt).
- **4 Gegnertypen** (Vorschlag): Hüpf-Blob (Standard), Flitzer (schnell, wenig Leben), Panzerklotz (langsam, viel Leben), Splitter (zerfällt in 2 kleine).
- **Mini-Boss** in Welle 5: z. B. ein übergroßer Panzerklotz mit einfacher Angriffsphase. **[offen für Builder]**
- **Endboss:** Segmentwurm mit Phasen-Regeln aus §4.
  - Split-Mechanik **[Builder-Entscheidung beim Aufschreiben]**: Jedes Segment hat eigenes Leben. Auto-Aim zielt auf das nächste Segment. Wird ein Segment zerstört, das *nicht* Kopf oder Schwanz ist, teilt sich der Wurm an dieser Stelle in zwei Würmer. Der hintere Teil bekommt einen neuen Kopf. Würmer mit weniger als 3 Segmenten teilen sich nicht mehr, und es gibt höchstens 4 Würmer gleichzeitig. Der Boss ist besiegt, wenn alle Segmente zerstört sind. So entsteht das Teilen von selbst, durch Positionierung und Flächenwaffen, ohne manuelles Zielen.
- Startmenü, Pause, Sieg-/Niederlage-Bildschirm mit Sternen.
- **Nicht in Phase 1:** Freischalten, Speicherstand-Fortschritt, Multiplayer, weitere Maps/Bosse.

## 6. Plattform & Technik **[Builder-Entscheidung im Brainstorming, Dominik hat nicht widersprochen]**

- **Three.js** (WebGL) für Grafik, **JavaScript/TypeScript**, Build mit **Vite** **[Sprache/Build: offen für Builder]**.
- Verpackt als **Electron**-Desktop-App: `.exe`/Installer für Windows, `.app`/`.dmg` für macOS.
- Performance-Ziel: flüssige 60 FPS mit 100+ Gegnern auf einem normalen Laptop → Instanced Rendering für Gegner/Projektile/Würfel-Partikel. **[offen für Builder: Technik im Detail]**
- Performance-Ziel bezieht sich auf **gute, aktuelle Rechner** (Freunde haben gute Hardware) **[Dominik]**. Keine Grafikstufen nötig für Phase 1; eine einfache Qualitätsoption (z. B. Schatten aus) ist nice-to-have **[offen für Builder]**.
- **Distribution:** Phase 1 **ohne Code-Signatur** (Nutzer bestätigen einmal die Gatekeeper-/SmartScreen-Warnung). Ein Apple-Developer-Account ist vorhanden; Signierung/Notarisierung kann später nachgerüstet werden – Build-Pipeline so anlegen, dass das ohne Umbau möglich ist. **[Dominik]**
- **Sprache des Spiels: Englisch**, später eventuell zusätzlich Deutsch. **[Dominik]** Daher alle sichtbaren Texte von Anfang an zentral über Text-Schlüssel ablegen (einfaches i18n-Gerüst, zunächst nur `en`), damit Deutsch später nur eine neue Sprachdatei ist. **[Builder-Entscheidung beim Aufschreiben]**
- **Open Source:** Das Spiel wird als Open-Source-Projekt veröffentlicht. **[Dominik]** Lizenz: **MIT** **[Builder-Entscheidung beim Aufschreiben; vor Veröffentlichung änderbar]**. Alle Assets (Code, Sounds, Grafik) müssen selbst erstellt oder kompatibel lizenziert sein; Drittanbieter-Abhängigkeiten nur mit freier Lizenz.
- **Sauberer Projektordner:** Alles liegt in einem eigenen Ordner `cube-crashers/` (wird das Git-Repo) mit klarer Struktur, README (Spielen, Bauen, Mitmachen), LICENSE und `.gitignore`. **[Dominik]**
- Stand jetzt: Ordner enthält nur dieses Dokument; noch kein Code, noch kein Git-Repo.

## 7. Später: Fortschritt (Phase 1b, nach der ersten spielbaren Version)

Mit verdienten Sternen werden neue Waffen, Türme und Maps freigeschaltet – Anreiz zum Weiterspielen. **[Builder-Entscheidung im Brainstorming, angenommen]** Details später.

## 8. Später: LAN-Multiplayer (Phase 2) – Vorgaben, die Phase 1 schon beeinflussen

**[Dominik]:**
- Bis zu **6 Spieler** im lokalen Netz, kooperativ.
- **Jede Installation hat den Server eingebaut.** Ein Spieler klickt „Spiel hosten“ – sein Spiel startet den Server im Hintergrund.
- **„Beitreten“ zeigt gefundene Spiele im LAN automatisch** als Liste (z. B. „Dominiks Spiel (2/6)“), ein Klick genügt. Keine IP-Eingabe. „So einfach wie möglich.“
- Im LAN sieht jeder, welche Bauplätze belegt sind.

**Konsequenz für Phase 1 (Builder-Vorgabe):** Spiellogik (Simulation: Gegner, Waffen, Türme, Münzen, Wellen, Boss) strikt **getrennt von Darstellung und Eingabe** bauen, mit fester Tick-Rate und Eingaben als Befehle. Dann kann in Phase 2 der Host die Simulation autoritativ ausführen und Zustände an Clients verteilen, ohne die Spiellogik neu zu schreiben. Netzwerk-Technik (z. B. WebSocket im Electron-Hauptprozess, UDP-Broadcast/mDNS zur Spielsuche) **[offen für Builder in Phase 2]**.

Offen für Phase 2 (nicht jetzt entscheiden): ob alle 6 eine gemeinsame breite Front verteidigen oder jeder eine eigene Lane hat; wie Münzen geteilt werden; Skalierung der Schwierigkeit mit Spielerzahl.

## 9. Dem Builder überlassen

Balancing aller Zahlen (Leben, Schaden, Kosten, Wellen-Zusammensetzung), genaue Waffen-/Turm-/Gegner-Mechaniken innerhalb der obigen Beschreibungen, Sound und Musik, UI-Gestaltung im Voxel-/Retro-Stil, Code-Struktur, Tests, Map-Layout der ersten Map.

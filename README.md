# Cart Crash

Gioco per browser (in inglese, tradotto in 6 lingue) pensato per CrazyGames.
È una **gara** in carrello della spesa giù per un borgo italiano in discesa, in
3D, vista da dietro: un ragazzo col cappellino al contrario guida il carrello
stando in piedi dietro. Hai una **lista della spesa**: prendi quello che c'è
scritto, evita il resto (ti ruba spazio) e corri alla **cassa**. Vince il tempo
più breve.

## Come si gioca

| Azione | Computer | Telefono |
|---|---|---|
| Sterzare | ← → oppure A / D | tieni premuto il lato sinistro o destro |
| Frenare | ↓ oppure S | scorri in giù e tieni premuto |
| Saltare | ↑, W oppure spazio | scorri in su |
| Mollare l'oggetto in cima alla pila | E (o X) | pulsante **Molla** |
| Liberare un palloncino | Q (o R) | pulsante **Libera** (compare quando hai palloncini) |
| Pausa | Esc o P | pulsante ⏸ |

- **La lista** (in alto) è nuova a ogni gara: 4 cose diverse, 2-3 di ciascuna
  (1-2 angurie), circa 9 oggetti. Una cosa conta solo se è in lista e solo fino
  al numero richiesto; oltre i 5,2 m di pila quello che prendi scivola via
  ("No room!").
- **La cassa** compare 70 m più avanti appena nel carrello c'è tutta la lista:
  si vince solo così. Se prima di arrivarci perdi qualcosa della lista, la
  cassa sparisce finché non lo riprendi.
- **Punteggio** = tempo + **5 secondi per ogni oggetto extra** nel carrello
  alla cassa (cose fuori lista o in più del richiesto; i palloncini non
  contano). Con **Molla** butti l'oggetto in cima prima della cassa e non lo
  paghi. Il record (punteggio più basso) resta sul dispositivo.
- **Sei fuori** al terzo schianto (cassonetti, casse, coni, motorini,
  dissuasori, transenne, panchine, tubi, passanti) o se ti prende il **treno**.
  Dopo uno schianto hai 1,6 s di tregua.
- **Semafori**: quando ti avvicini diventano gialli e poi rossi, e una folla
  attraversa sulle strisce. Se col rosso **vai addosso a qualcuno**, quella
  persona vola via e ti cade **tutto** il carico (non perdi vite, ma devi
  riprendere la spesa). In ogni caso, se passi col rosso ti insegue un
  **vigile** per 10 secondi: ti prende solo se rallenti, e la multa costa una
  vita. Frena e aspetta il verde.
- **Passaggi a livello**: campanella, sbarre giù, poi passa il treno. Se sei sui
  binari mentre passa, la gara è finita. Fermati alla linea.
- **Cani e vigile** corrono accanto al carrello, appena dietro, sempre
  inquadrati (la visuale si allarga mentre ti inseguono). Il cane compare a caso
  lungo la strada.
- **Cani**: quando passi vicino a un cane ti insegue per 12 secondi. Se rallenti (per esempio a
  un semaforo) ti raggiunge e ti costa una vita, a meno che tu non gli lasci
  cadere qualcosa: si ferma a mangiarlo e ti lascia stare.
- **Ostacoli bassi** (transenne, panchine, scatoloni, tubi dei lavori stradali):
  si possono saltare. Atterrare scuote la pila.
- **Pedoni**: tanti, anche a gruppi, che attraversano o salgono lungo la strada.

| Oggetto | Effetto |
|---|---|
| Anguria | pesa: il carrello sterza più lento e scende più veloce |
| Palloncini | alleggeriscono: piccoli salti che scavalcano buche e pozzanghere; non sono mai in lista e non contano come extra; si liberano con Q / **Libera** |
| Olio d'oliva | scivoli per circa 3 s; anche le pozzanghere d'olio fanno scivolare |
| Spesa varia (cereali, carta igienica, pomodori, pane, formaggio, bibita, ananas, detersivo) | la pila cresce, ondeggia quando sterzi e se pende troppo l'oggetto in cima cade |
| Uova | si rompono sui colpi forti (buche, atterraggi, schianti) |

Le cose della lista hanno un anello verde e una freccia verde sopra; le altre
un anello bianco.

## Tecnica

- HTML5 + JavaScript (moduli ES), **Three.js r170** in `vendor/three/` (MIT),
  nessuna libreria di fisica: la pila è una molla simulata a mano in
  `src/game.js`.
- Tutti i modelli sono low-poly costruiti nel codice (`src/models.js`,
  `src/town.js`): nessun file di modelli o texture. Font Lilita One e Nunito
  (OFL) in `vendor/fonts/`.
- Il percorso si genera a sezioni da un seme (`src/world.js`), con più oggetti
  della lista che del resto; quello che resta indietro viene scartato.
- La simulazione (`src/game.js`) è deterministica e separata dal disegno
  (`src/render3d.js`); i test guidano gare intere senza browser. `src/bot.js`
  è un pilota automatico (sfondo del menu, test, video).
- Lingue: en, it, fr, es, de, pt (`src/locales/`). Lingua da CrazyGames
  (`user.systemInfo.locale`) o dal browser, modificabile nelle impostazioni.
- Il gioco sta tutto nel riquadro, senza barre di scorrimento, su computer e
  telefono (verticale e orizzontale); pulsanti di almeno 44 px.

## Comandi npm

```
npm install
npm run dev               # build web in dist/ e server su http://127.0.0.1:8080
npm test                  # test unitari (mondo, lista, cassa, freno, salto, cani, semafori, treni, traduzioni)
npm run test:e2e          # Playwright: telefono, telefono orizzontale, desktop, build CrazyGames con SDK finto
npm run build:crazygames  # dist-crazygames/ e crazygames/cart-crash-crazygames.zip
npm run media             # copertine, icone e video di anteprima ricavati dal gioco
npm run shots             # screenshot rapidi per controllare la grafica
```

## CrazyGames

`npm run build:crazygames` produce la cartella `dist-crazygames/` e lo zip
`crazygames/cart-crash-crazygames.zip`. **Lo zip non va caricato così com'è:**
va estratto, e i file vanno trascinati nel portale.

La build per CrazyGames (`src/portal.js`, SDK v3 caricato solo lì):

- `init` all'avvio, `loadingStart` / `loadingStop` intorno al caricamento;
- `gameplayStart` quando parte o riprende la gara, `gameplayStop` in pausa,
  nel menu e a fine gara;
- `happytime` quando batti il tuo miglior tempo;
- rispetta `settings.muteAudio` e `addSettingsChangeListener`;
- lingua da `user.systemInfo.locale`.

Niente login, niente pubblicità esterne, niente link verso altri siti. La
pagina `privacy.html` è dentro lo zip ed è linkata dal menu e dalle
impostazioni (anche su telefono). Contatto: info@eyeball.cloud.

Logo: `brand/logo-original.webp` (originale) e `brand/logo-transparent.png`
(ritagliato, sfondo trasparente); nel gioco si usa `assets/logo.webp`, e le
icone `assets/icon-*.png` sono ricavate dal logo.

Materiali in `crazygames/`, generati dal gioco con `npm run media` (il logo è
sovrapposto alle copertine):

- copertine `cover-1920x1080.png`, `cover-800x1200.png` (2:3), `cover-800x800.png`;
- trailer `preview-1920x1080.mp4` e `preview-1080x1620.mp4` (2:3), circa 30 s.

Il trailer (`scripts/trailer.mjs`) è registrato dal gioco vero, fotogramma per
fotogramma: una sola gara preparata apposta (`scripts/trailer-stage.mjs`) e
raccontata in ordine, un brivido dopo l'altro: la lista, il salto, il cane,
il rosso passato sfiorando la folla col vigile alle calcagna, la frenata
all'ultimo davanti al treno, lo sprint alla cassa col tempo. Scritte che
cambiano a ogni momento, il logo all'inizio e alla fine, le soste accelerate.

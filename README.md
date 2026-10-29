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
- **Sei fuori** quando finisci le vite: ogni schianto (cassonetti, casse,
  coni, motorini, dissuasori, transenne, panchine, tubi, passanti) ne costa una.
  Dopo uno schianto hai 1,6 s di tregua.
- **Treno, spazzaneve, onda gigante e cadute** (in acqua, nella lava, giù
  dall'arcobaleno): non sei fuori, ma perdi **una vita e tutto il carico**.
- **Semafori**: quando ti avvicini diventano gialli e poi rossi, e una folla
  attraversa sulle strisce. Se col rosso **vai addosso a qualcuno**, quella
  persona vola via e ti cade **tutto** il carico (non perdi vite, ma devi
  riprendere la spesa). In ogni caso, se passi col rosso ti insegue un
  **vigile** per 10 secondi: ti prende solo se rallenti, e la multa costa una
  vita. Frena e aspetta il verde.
- **Passaggi a livello**: campanella, sbarre giù, poi passa il treno (in
  Montagna lo spazzaneve, al Mare l'onda gigante), tarato per arrivare proprio
  quando arrivi tu. Fermati alla linea e aspetta che passi.
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
| Palloncini | il prossimo salto diventa un **super salto** (più alto e lungo), poi il palloncino sparisce; non sono mai in lista e non contano come extra; si liberano con Q / **Libera** |
| Olio d'oliva | scivoli per circa 3 s; anche le pozzanghere d'olio fanno scivolare |
| Spesa varia (cereali, carta igienica, pomodori, pane, formaggio, bibita, ananas, detersivo) | la pila cresce, ondeggia quando sterzi e se pende troppo l'oggetto in cima cade |
| Uova | si rompono sui colpi forti (buche, atterraggi, schianti) |

Le cose della lista hanno un anello verde e una freccia verde sopra; le altre
un anello bianco.

## Piste, monete e garage

**5 piste**, sbloccate una dopo l'altra finendo quella prima (`src/tracks.js`).
Ognuna aggiunge qualcosa di suo:

| Pista | Cosa porta di nuovo |
|---|---|
| 1. Borgo | semafori e vigile, cani, passaggio a livello col treno |
| 2. Montagna | piste da sci con reti e bandierine, **palle di neve giganti** che ti rotolano dietro (non rallentare!), **trampolini** con le monete in aria, **lago ghiacciato** (si scivola sempre), sciatori, pupazzi di neve, **capre**, lo **spazzaneve** al posto del treno |
| 3. Mare | **pontili senza bordi** (se cadi in acqua perdi una vita), **buchi** tra un pontile e l'altro da saltare (con la rampa), isole con spiaggia e capanne, **onde** che ti spingono di lato, **granchi**, **gabbiani che rubano** l'oggetto in cima alla pila, un'**onda gigante** al posto del treno |
| 4. Vulcano | un **masso gigante** che ti rotola dietro per tutta la gara (se ti fermi ti schiaccia), **fiumi di lava** da saltare, **ponti di corda** stretti che oscillano e **crollano dietro di te** (se rallenti cadi), **geyser** che ti lanciano in aria, **scimmie che rubano** |
| 5. Arcobaleno | pista sospesa nello spazio senza muri, **frecce turbo**, **blocchi che si muovono** da un lato all'altro |

- **Ogni pista ha i suoi negozi** (`src/catalog.js`): 8 prodotti suoi più le sue
  versioni delle tre cose speciali (pesante, scivolosa, fragile): anguria, olio e
  uova nel Borgo; forma di formaggio, burro e miele in Montagna; cocomero
  gigante, crema solare e conchiglie al Mare; noce di cocco gigante, buccia di
  banana e uova di dinosauro nel Vulcano; meteorite, gelatina cosmica e
  cristalli di stella sull'Arcobaleno.
- **Monete** sulla strada (in fila e in aria): restano anche se la gara va male.
  Alla cassa c'è il bonus della pista (20, 35, 50, 70, 90); **la prima volta**
  che finisci una pista il premio è 100, 200, 300, 400 o 500 monete.
- **Cuori**: rarissimi, ridanno una vita (o 25 monete se le hai tutte).
- **Palloncini**: con un palloncino il salto normale diventa un super salto e il
  palloncino si consuma (utile per buchi, acqua e lava).
- **Pila**: la parte sopra la testa del ragazzo diventa semitrasparente.
- **Inseguitori** (vigile, animali, palle di neve): durano meno col carrello
  veloce e di più con quello lento.
- **Garage** (`src/carts.js`): con le monete si comprano carrelli diversi.
  | Carrello | Prezzo | Vite | Caratteristiche |
  |---|---|---|---|
  | Classico | gratis | 3 | equilibrato |
  | Ferro | 150 | 4 | pesante: una vita in più, sterza un po' più lento |
  | Da corsa | 400 | 3 | più veloce e sterza meglio, semina prima gli inseguitori |
  | Jumbo | 700 | 4 | più spazio per la pila, molto stabile |
  | Razzo | 1500 | 5 | veloce, sterza bene, stabile |
- I progressi (monete, carrelli, piste aperte e vinte, record) restano sul
  dispositivo (`src/progress.js`); su Playgama vanno anche nel loro cloud save.

## Classica e Arcade

Nel menu, sotto la pista scelta, ci sono due modalità:

- **Classica**: la tua lista, contro il tempo (tutto quello descritto sopra).
- **Arcade**: tu contro **2 avversari** guidati dal computer, con nome e felpa
  colorata, sulla stessa strada (`src/versus.js`). Prima si sceglie il livello:
  **Principiante**, **Normale** o **Esperto** (velocità, precisione e quanto
  vanno a cercare gli oggetti cambiano col livello; resta salvato).

In Arcade:

- Sulla pista ci sono **solo 7 oggetti** (7 prodotti di quella pista). Chi li ha
  **tutti e 7 vince subito**; dopo **3 minuti** vince chi ne ha di più.
- Non si perdono vite: schianti, cadute, inseguitori, treni e onde fanno
  **cadere gli oggetti**, che restano sulla strada e chiunque può raccoglierli.
- **Urtarsi** fa solo rimbalzare i carrelli: nessuno perde niente.
- I **ponti di corda** crollano solo dietro all'ultimo carrello: chi è davanti
  non li rompe per chi deve ancora passare.
- Sulla strada ci sono **monete**: quelle raccolte restano tue.
- Un oggetto rimasto indietro rispetto a tutti ricompare più avanti, così i 7
  restano sempre in gioco.
- In alto a sinistra la classifica, al centro il tempo che resta.

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
- Suoni e musica sintetizzati con Web Audio (`src/audio.js`), senza file: un
  motivo tranquillo nel menu e uno incalzante diverso per ogni pista.
- Lingue: en, it, fr, es, de, pt (`src/locales/`). Lingua da CrazyGames
  (`user.systemInfo.locale`) o dal browser, modificabile nelle impostazioni.
- Il gioco sta tutto nel riquadro, senza barre di scorrimento, su computer e
  telefono (verticale e orizzontale); pulsanti di almeno 44 px.

## Comandi npm

```
npm install
npm run dev               # build web in dist/ e server su http://127.0.0.1:8080
npm test                  # test unitari (mondo, lista, cassa, freno, salto, cani, semafori, treni, traduzioni)
npm run test:e2e          # Playwright: telefono, telefono orizzontale, desktop, build CrazyGames e Playgama con SDK finti
npm run build:crazygames  # dist-crazygames/ e crazygames/cart-crash-crazygames.zip
npm run build:playgama    # dist-playgama/ e playgama/cart-crash-playgama.zip
npm run build:unlocked    # versione di prova Playgama con tutto sbloccato (tester/, da non pubblicare)
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
impostazioni (anche su telefono); è in inglese. Contatto: help@trustyourbot.com.
Lo zip non contiene immagini oltre al logo che il gioco mostra: icone e
copertine si caricano a parte.

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

## Playgama

`npm run build:playgama` produce `dist-playgama/` e lo zip
`playgama/cart-crash-playgama.zip` (con `index.html` alla radice, da caricare
così com'è). La build carica il **Playgama Bridge SDK**
(`https://bridge.playgama.com/v2/stable/playgama-bridge.js`) e porta con sé
`playgama-bridge-config.json` (`src/portal-playgama.js`):

- `bridge.initialize()` all'avvio, `game_ready` una sola volta a caricamento
  finito;
- `gameplay_started` / `gameplay_stopped` come su CrazyGames (gara, pausa,
  menu, fine gara);
- lingua da `bridge.platform.language`;
- audio: segue `isAudioEnabled` e `audio_state_changed`;
- pausa: su `pause_state_changed` il gioco va in pausa e si zittisce;
- record e numero di gare salvati anche con `bridge.storage` (cloud save);
- un **interstitial** tra una gara e l'altra (su "Gioca ancora" e "Menu"), con
  il gioco muto finché è aperto; Playgama decide se e quando c'è un annuncio,
  con almeno 60 s tra uno e l'altro (`playgama-bridge-config.json`).

Copertine in `playgama/`: `cover-1920x1080.png` e `cover-1080x1920.png` sono
l'illustrazione in `brand/cover-art-*.webp` ritagliata alla misura;
`cover-800x800.png` viene da `npm run media`. I video sono quelli di `crazygames/`.
